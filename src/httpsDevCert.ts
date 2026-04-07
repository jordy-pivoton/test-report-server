import selfsigned from "selfsigned";

/** Local HTTPS: SAN covers hostname + loopback IPv4/IPv6 for fewer browser warnings. */
const subjectAttrs = [{ name: "commonName", value: "localhost" }];

const selfsignedOptions = {
  keySize: 2048,
  days: 825,
  algorithm: "sha256" as const,
  extensions: [
    { name: "basicConstraints" as const, cA: true },
    {
      name: "keyUsage" as const,
      keyCertSign: true,
      digitalSignature: true,
      nonRepudiation: true,
      keyEncipherment: true,
      dataEncipherment: true,
    },
    {
      name: "subjectAltName" as const,
      altNames: [
        { type: 2, value: "localhost" },
        { type: 7, ip: "127.0.0.1" },
        { type: 7, ip: "::1" },
      ],
    },
  ],
};

export function generateDevHttpsPems(): { cert: string; key: string } {
  const pems = selfsigned.generate(subjectAttrs, selfsignedOptions);
  return { cert: pems.cert, key: pems.private };
}
