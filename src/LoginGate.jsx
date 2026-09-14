import React, { useState, useEffect } from "react";
import * as OTPAuth from "otpauth";

// ---- Hardcoded credentials (client-side only — see README security note) ----
const USERNAME = "JJN2804";
const PASSWORD = "J#@2804#@$2003";
const TOTP_SECRET = "DDQBMMPTV7J3BAQGJZBN2ZTSQIR3T3OB"; // add this to your authenticator app

const totp = new OTPAuth.TOTP({
  issuer: "Confluence Desk",
  label: USERNAME,
  algorithm: "SHA1",
  digits: 6,
  period: 30,
  secret: OTPAuth.Secret.fromBase32(TOTP_SECRET),
});

const BG = "#0D1117";
const CARD = "#161B22";
const BORDER = "#30363D";
const TEXT = "#E6EDF3";
const MUTED = "#8B949E";
const ACCENT = "#5B8DEF";
const DANGER = "#F85149";

const SESSION_KEY = "cd_auth_ok";

export default function LoginGate({ children }) {
  const [authed, setAuthed] = useState(() => sessionStorage.getItem(SESSION_KEY) === "1");
  const [step, setStep] = useState("credentials"); // "credentials" | "totp"
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (authed) sessionStorage.setItem(SESSION_KEY, "1");
  }, [authed]);

  if (authed) return children;

  function submitCredentials(e) {
    e.preventDefault();
    setError("");
    if (username.trim() === USERNAME && password === PASSWORD) {
      setStep("totp");
    } else {
      setError("Incorrect username or password.");
    }
  }

  function submitTotp(e) {
    e.preventDefault();
    setError("");
    // window: 1 allows a ±30s clock-skew tolerance
    const delta = totp.validate({ token: code.trim(), window: 1 });
    if (delta !== null) {
      setAuthed(true);
    } else {
      setError("Incorrect or expired code.");
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: BG,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "system-ui, -apple-system, sans-serif",
        padding: 16,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 380,
          background: CARD,
          border: `1px solid ${BORDER}`,
          borderRadius: 12,
          padding: 28,
        }}
      >
        <div style={{ color: TEXT, fontSize: 20, fontWeight: 700, marginBottom: 4 }}>
          Confluence Desk
        </div>
        <div style={{ color: MUTED, fontSize: 13, marginBottom: 22 }}>
          {step === "credentials" ? "Sign in to continue" : "Enter your 6-digit authenticator code"}
        </div>

        {step === "credentials" && (
          <form onSubmit={submitCredentials}>
            <input
              autoFocus
              type="text"
              placeholder="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              style={inputStyle}
            />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={inputStyle}
            />
            {error && <div style={errorStyle}>{error}</div>}
            <button type="submit" style={buttonStyle}>
              Continue
            </button>
          </form>
        )}

        {step === "totp" && (
          <form onSubmit={submitTotp}>
            <input
              autoFocus
              type="text"
              inputMode="numeric"
              maxLength={6}
              placeholder="123456"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              style={{ ...inputStyle, letterSpacing: 4, textAlign: "center", fontSize: 20 }}
            />
            {error && <div style={errorStyle}>{error}</div>}
            <button type="submit" style={buttonStyle}>
              Verify
            </button>
            <button
              type="button"
              onClick={() => {
                setStep("credentials");
                setPassword("");
                setCode("");
                setError("");
              }}
              style={{ ...buttonStyle, background: "transparent", color: MUTED, marginTop: 8 }}
            >
              Back
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

const inputStyle = {
  width: "100%",
  boxSizing: "border-box",
  background: "#0D1117",
  border: `1px solid ${BORDER}`,
  color: TEXT,
  borderRadius: 8,
  padding: "10px 12px",
  fontSize: 14,
  marginBottom: 12,
  outline: "none",
};

const buttonStyle = {
  width: "100%",
  background: ACCENT,
  color: "#0D1117",
  border: "none",
  borderRadius: 8,
  padding: "10px 12px",
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
};

const errorStyle = {
  color: DANGER,
  fontSize: 13,
  marginBottom: 12,
};
