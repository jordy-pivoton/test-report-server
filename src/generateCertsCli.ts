import fs from "fs";
import path from "path";
import { generateDevHttpsPems } from "./httpsDevCert.js";

const root = path.resolve(process.cwd());
const certDir = path.join(root, "cert");
const certPath = path.join(certDir, "cert.pem");
const keyPath = path.join(certDir, "key.pem");

fs.mkdirSync(certDir, { recursive: true });
const { cert, key } = generateDevHttpsPems();
fs.writeFileSync(certPath, cert, "utf8");
fs.writeFileSync(keyPath, key, "utf8");
console.log(`Wrote ${certPath}`);
console.log(`Wrote ${keyPath}`);
