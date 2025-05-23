from flask import Flask, request, jsonify
import os
from dotenv import load_dotenv
import google.generativeai as genai
import re
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_community.vectorstores import FAISS
from langchain_google_genai import GoogleGenerativeAIEmbeddings
import json
from flask_cors import CORS

load_dotenv()

app = Flask(__name__)
CORS(app)

genai.configure(api_key=os.getenv("API_KEY"))
model = genai.GenerativeModel('gemini-pro')
embeddings = GoogleGenerativeAIEmbeddings(
    model="models/embedding-001",
    google_api_key=os.getenv("API_KEY")
)

vector_store = None

SECURITY_PATTERNS = {
    "sensitiveData": {
        "pattern": r"(password|secret|token|key|api[\_-]?key|credentials?|auth_token)[\s]*[=:]\s*['\"`][^'\"`]*['\"`]",
        "score": -20,
        "message": "Possible sensitive data exposure"
    },
    "sqlInjection": {
        "pattern": r"(\$\{.*\}.*(?:SELECT|INSERT|UPDATE|DELETE)|(?:SELECT|INSERT|UPDATE|DELETE).*\+\s*['\"]\s*\+)",
        "score": -15,
        "message": "Potential SQL injection vulnerability"
    },
    "commandInjection": {
        "pattern": r"(eval\s*\(|exec\s*\(|execSync|spawn\s*\(|fork\s*\(|child_process|shelljs|\.exec\(.*\$\{)",
        "score": -25,
        "message": "Potential command injection risk"
    },
    "insecureConfig": {
        "pattern": r"(allowAll|disableSecurity|noValidation|validateRequest:\s*false|security:\s*false)",
        "score": -10,
        "message": "Potentially insecure configuration"
    },
    "xssVulnerability": {
        "pattern": r"(innerHTML|outerHTML|document\.write|eval\(.*\$\{|dangerouslySetInnerHTML)",
        "score": -15,
        "message": "Potential XSS vulnerability"
    },
    "unsafeDeserialize": {
        "pattern": r"(JSON\.parse\(.*\$\{|eval\(.*JSON|deserialize\(.*user|fromJSON\(.*input)",
        "score": -20,
        "message": "Unsafe deserialization of data"
    },
    "maliciousPackages": {
        "pattern": r"\"dependencies\":\s*{[^}]*\"(evil-|malicious-|hack-|unsafe-|vulnerable-)",
        "score": -30,
        "message": "Potentially malicious package dependency"
    },
    "cryptoMining": {
        "pattern": r"(crypto\.?miner|mineCrypto|coinHive|webMining|monero\.?miner)",
        "score": -50,
        "message": "Potential cryptocurrency mining code"
    },
    "dataExfiltration": {
        "pattern": r"(\.upload\(.*\$\{|fetch\(['\"`]https?://[^/]+.[^/]+/[^/]+?.*\${)",
        "score": -40,
        "message": "Potential data exfiltration attempt"
    },
    "obfuscatedCode": {
        "pattern": r"(eval\$atob|eval\(decode|String\.fromCharCode.*\$\.call\(|\\x[0-9a-f]{2}|\\u[0-9a-f]{4}){10,}",
        "score": -35,
        "message": "Heavily obfuscated code detected"
    },
    "suspiciousUrls": {
        "pattern": r"https?://(?:[^/]+.)?(?:xyz|tk|ml|ga|cf|gq|pw|top|club)/[^\s'\"]+",
        "score": -15,
        "message": "Suspicious URL domain detected"
    },
    "hardcodedIPs": {
        "pattern": r"(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?).){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)",
        "score": -5,
        "message": "Hardcoded IP address detected"
    },
    "debugCode": {
        "pattern": r"(console.log|debugger|alert\()",
        "score": -5,
        "message": "Debug code found in production"
    }
}

def initialize_rag():
    """Initialize RAG with security documentation"""
    global vector_store

    security_docs = []
    for vuln_type, pattern_info in SECURITY_PATTERNS.items():
        doc = f"""
        Vulnerability Type: {vuln_type}
        Description: {pattern_info['message']}
        Pattern: {pattern_info['pattern']}
        Severity Score: {pattern_info['score']}
        
        Common examples and best practices for preventing {vuln_type}:
        - Use secure coding practices
        - Implement proper input validation
        - Follow security guidelines
        - Use recommended security libraries
        """
        security_docs.append(doc)

    text_splitter = RecursiveCharacterTextSplitter(
        chunk_size=1000,
        chunk_overlap=200
    )
    texts = text_splitter.create_documents(security_docs)

    vector_store = FAISS.from_documents(texts, embeddings)

def analyze_with_gemini(code_snippet, vulnerability_type, context=None):
    """Use Gemini to analyze code for specific vulnerability type"""
    try:
        if vector_store:
            docs = vector_store.similarity_search(
                f"{vulnerability_type} vulnerability in code",
                k=2
            )
            context = "\n".join([doc.page_content for doc in docs])

        prompt = f"""Analyze the following code for {vulnerability_type}:

Code:
{code_snippet}

Security Context:
{context}

Provide a detailed analysis of potential security risks and recommendations for fixing them.
Focus specifically on {vulnerability_type} vulnerabilities.
Use the provided security context to make your analysis more accurate.
"""

        response = model.generate_content(prompt)
        return response.text
    except Exception as e:
        return f"Error analyzing with Gemini: {str(e)}"

def analyze_security(files):
    """Analyze files for security vulnerabilities"""
    total_score = 100
    findings = []
    inline_comments = []

    for file in files:
        content = file.get('content', '')
        lines = content.split('\n')

        for line_num, line in enumerate(lines, 1):
            for vuln_type, pattern_info in SECURITY_PATTERNS.items():
                if re.search(pattern_info['pattern'], line, re.IGNORECASE):
                    total_score += pattern_info['score']
                    findings.append(f"🔍 **{file.get('filename', 'unknown')}** - {pattern_info['message']}")
                    
                    gemini_analysis = analyze_with_gemini(line, vuln_type)
                    
                    inline_comments.append({
                        "path": file.get('filename', 'unknown'),
                        "position": line_num,
                        "body": f"""⚠️ **Security Issue Detected**: {pattern_info['message']}

Problematic code: `{line.strip()}`

Gemini Analysis:
{gemini_analysis}

Recommendation: Review and fix this potential security concern."""
                    })

    level = "monitor"
    if total_score < 80:
        level = "review"
    if total_score < 40:
        level = "warn"

    return {
        "score": total_score,
        "level": level,
        "findings": findings,
        "inline_comments": inline_comments
    }

@app.route('/analyze', methods=['POST'])
def analyze():
    """Endpoint to analyze code for security vulnerabilities"""
    try:
        data = request.json
        if not data or 'files' not in data:
            return jsonify({"error": "No files provided"}), 400

        analysis_result = analyze_security(data['files'])
        return jsonify(analysis_result)

    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({"status": "healthy"})

initialize_rag()

if __name__ == '__main__':
    app.run(debug=True, port=5000)
