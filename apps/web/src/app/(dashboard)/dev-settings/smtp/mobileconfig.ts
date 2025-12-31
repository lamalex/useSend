interface MobileConfigOptions {
  emailAddress: string;
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  accountName: string;
  // Incoming mail server (IMAP) settings - piggyback on existing account
  imapHost: string;
  imapPort: number;
  imapUser: string;
}

function generateUUID(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16).toUpperCase();
  });
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function generateMobileConfig({
  emailAddress,
  smtpHost,
  smtpPort,
  smtpUser,
  accountName,
  imapHost,
  imapPort,
  imapUser,
}: MobileConfigOptions): string {
  const payloadUUID = generateUUID();
  const profileUUID = generateUUID();
  const domain = emailAddress.split("@")[1] ?? "usesend";
  const identifier = `com.usesend.smtp.${domain.replace(/\./g, "-")}`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>

  <key>PayloadContent</key>
  <array>
    <dict>

      <!-- User-visible labels -->
      <key>EmailAccountDescription</key>
      <string>${escapeXml(accountName)} (UseSend)</string>

      <key>EmailAccountName</key>
      <string>${escapeXml(accountName)}</string>

      <!-- From address -->
      <key>EmailAddress</key>
      <string>${escapeXml(emailAddress)}</string>

      <!-- Account type - IMAP required for iOS -->
      <key>EmailAccountType</key>
      <string>EmailTypeIMAP</string>

      <!-- Incoming (IMAP) - piggyback on existing account -->
      <key>IncomingMailServerHostName</key>
      <string>${escapeXml(imapHost)}</string>

      <key>IncomingMailServerPortNumber</key>
      <integer>${imapPort}</integer>

      <key>IncomingMailServerUseSSL</key>
      <true/>

      <key>IncomingMailServerAuthentication</key>
      <string>EmailAuthPassword</string>

      <key>IncomingMailServerUsername</key>
      <string>${escapeXml(imapUser)}</string>

      <!-- Prompt at install for IMAP password -->
      <key>IncomingPassword</key>
      <string></string>

      <!-- Outgoing (SMTP - UseSend) -->
      <key>OutgoingMailServerHostName</key>
      <string>${escapeXml(smtpHost)}</string>

      <key>OutgoingMailServerPortNumber</key>
      <integer>${smtpPort}</integer>

      <key>OutgoingMailServerUseSSL</key>
      <true/>

      <key>OutgoingMailServerAuthentication</key>
      <string>EmailAuthPassword</string>

      <key>OutgoingMailServerUsername</key>
      <string>${escapeXml(smtpUser)}</string>

      <!-- Prompt at install for SMTP password -->
      <key>OutgoingPassword</key>
      <string></string>

      <!-- Payload Metadata -->
      <key>PayloadType</key>
      <string>com.apple.mail.managed</string>

      <key>PayloadVersion</key>
      <integer>1</integer>

      <key>PayloadIdentifier</key>
      <string>${escapeXml(identifier)}.mail</string>

      <key>PayloadUUID</key>
      <string>${payloadUUID}</string>

      <key>PayloadDisplayName</key>
      <string>UseSend Mail Account</string>

    </dict>
  </array>

  <!-- Profile Metadata -->
  <key>PayloadType</key>
  <string>Configuration</string>

  <key>PayloadVersion</key>
  <integer>1</integer>

  <key>PayloadIdentifier</key>
  <string>${escapeXml(identifier)}.profile</string>

  <key>PayloadUUID</key>
  <string>${profileUUID}</string>

  <key>PayloadDisplayName</key>
  <string>${escapeXml(accountName)} (UseSend)</string>

  <key>PayloadOrganization</key>
  <string>UseSend</string>

  <key>PayloadRemovalDisallowed</key>
  <false/>

</dict>
</plist>
`;
}
