# Security Policy

## Supported Versions

We actively maintain and patch the following versions of ReligioGram:

| Version | Supported |
|---------|-----------|
| latest (main) | ✅ |
| latest-1 minor | ✅ security fixes only |
| older | ❌ |

## Reporting a Vulnerability

**Please do not open a public GitHub issue for security vulnerabilities.**

### Preferred Channel

Email: **security@religiogram.in**

PGP key fingerprint: *(publish your GPG key ID here before going live)*

We use GitHub's private security advisory feature. You may also open a draft advisory directly at:
`https://github.com/religiogram/religiogram/security/advisories/new`

### What to Include

- A clear description of the vulnerability and its potential impact
- Steps to reproduce (proof-of-concept is helpful but not required)
- Affected component(s) and version(s)
- Any suggested mitigations

### What to Expect

| Timeline | Action |
|----------|--------|
| ≤ 24 hours | Acknowledgement of your report |
| ≤ 72 hours | Initial triage and severity assessment |
| ≤ 7 days | Patch development begins for Critical/High |
| ≤ 30 days | Fix released and coordinated disclosure |

### Severity Definitions

We follow the CVSS v3.1 base scoring system:

- **Critical (9.0–10.0):** Unauthenticated RCE, authentication bypass, mass data exfiltration
- **High (7.0–8.9):** Privilege escalation, significant PII exposure, financial data manipulation
- **Medium (4.0–6.9):** Limited data exposure, CSRF, stored XSS
- **Low (0.1–3.9):** Information disclosure, minor logic flaws

### Out of Scope

The following are **not** in scope for our bug bounty / responsible disclosure:

- Findings from automated scanners without demonstrated exploitability
- Social engineering attacks targeting ReligioGram employees
- Physical security attacks
- Denial-of-service attacks against our infrastructure
- Vulnerabilities in third-party services (Razorpay, Firebase, AWS) — please report those upstream

### Safe Harbor

ReligioGram will not pursue legal action against researchers who:

1. Make a good-faith effort to avoid privacy violations, data destruction, and service disruption
2. Report findings promptly and give us reasonable time to patch before disclosure
3. Do not access, modify, or exfiltrate user data beyond what is necessary to demonstrate the vulnerability

### Hall of Fame

Responsible researchers who report valid vulnerabilities will be credited in our security hall of fame (with your consent).

---

*This policy was last updated: 2025-01-01. For questions, contact security@religiogram.in.*
