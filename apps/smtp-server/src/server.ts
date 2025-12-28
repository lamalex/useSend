import { SMTPServer, SMTPServerOptions, SMTPServerSession } from "smtp-server";
import { Readable } from "stream";
import dotenv from "dotenv";
import { simpleParser } from "mailparser";
import { readFileSync, watch, FSWatcher } from "fs";

dotenv.config();

const AUTH_USERNAME = process.env.SMTP_AUTH_USERNAME ?? "usesend";
const BASE_URL =
  process.env.USESEND_BASE_URL ??
  process.env.UNSEND_BASE_URL ??
  "https://app.usesend.com";
const SSL_KEY_PATH =
  process.env.USESEND_API_KEY_PATH ?? process.env.UNSEND_API_KEY_PATH;
const SSL_CERT_PATH =
  process.env.USESEND_API_CERT_PATH ?? process.env.UNSEND_API_CERT_PATH;
const CAMPAIGN_DOMAIN = process.env.USESEND_CAMPAIGN_DOMAIN ?? "usesend.com";

interface CampaignTarget {
  contactBookId: string;
}

/**
 * Parses the "to" address to detect if this is a campaign send.
 * Campaign emails are sent to: contactBookId@usesend.com (or configured domain)
 * Returns the contactBookId if it's a campaign, null otherwise.
 */
function parseCampaignTarget(to: string | undefined): CampaignTarget | null {
  if (!to) return null;

  // Extract the first email address if multiple are provided
  const emailMatch = to.match(/<?([^<>\s,]+@[^<>\s,]+)>?/);
  if (!emailMatch) return null;

  const email = emailMatch[1].toLowerCase();
  const [localPart, domain] = email.split("@");

  if (domain === CAMPAIGN_DOMAIN.toLowerCase() && localPart) {
    return { contactBookId: localPart };
  }

  return null;
}

interface CampaignData {
  name: string;
  from: string;
  subject: string;
  contactBookId: string;
  html: string;
  replyTo?: string;
}

interface CampaignResponse {
  id: string;
  name: string;
  status: string;
}

/**
 * Creates a campaign and schedules it for immediate sending via the UseSend API.
 */
async function sendCampaignToUseSend(
  campaignData: CampaignData,
  apiKey: string,
): Promise<CampaignResponse> {
  try {
    // Step 1: Create the campaign with sendNow: true to schedule immediately
    const createEndpoint = "/api/v1/campaigns";
    const createUrl = new URL(createEndpoint, BASE_URL);
    console.log("Creating campaign via useSend API at:", createUrl.href);

    const payload = {
      name: campaignData.name,
      from: campaignData.from,
      subject: campaignData.subject,
      contactBookId: campaignData.contactBookId,
      html: campaignData.html,
      replyTo: campaignData.replyTo,
      sendNow: true, // Send immediately
    };

    console.log("Campaign payload:", JSON.stringify(payload, null, 2));

    const response = await fetch(createUrl.href, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error(
        "useSend Campaign API error response:",
        JSON.stringify(errorData, null, 4),
      );
      throw new Error(
        `Failed to create campaign: ${errorData || "Unknown error from server"}`,
      );
    }

    const responseData = (await response.json()) as CampaignResponse;
    console.log("useSend Campaign API response:", responseData);
    return responseData;
  } catch (error) {
    if (error instanceof Error) {
      console.error("Campaign error message:", error.message);
      throw new Error(`Failed to send campaign: ${error.message}`);
    } else {
      console.error("Unexpected campaign error:", error);
      throw new Error("Failed to send campaign: Unexpected error occurred");
    }
  }
}

async function sendEmailToUseSend(emailData: any, apiKey: string) {
  try {
    const apiEndpoint = "/api/v1/emails";
    const url = new URL(apiEndpoint, BASE_URL); // Combine base URL with endpoint
    console.log("Sending email to useSend API at:", url.href); // Debug statement

    const emailDataText = JSON.stringify(emailData);

    const response = await fetch(url.href, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: emailDataText,
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error(
        "useSend API error response: error:",
        JSON.stringify(errorData, null, 4),
        `\nemail data: ${emailDataText}`,
      );
      throw new Error(
        `Failed to send email: ${errorData || "Unknown error from server"}`,
      );
    }

    const responseData = await response.json();
    console.log("useSend API response:", responseData);
  } catch (error) {
    if (error instanceof Error) {
      console.error("Error message:", error.message);
      throw new Error(`Failed to send email: ${error.message}`);
    } else {
      console.error("Unexpected error:", error);
      throw new Error("Failed to send email: Unexpected error occurred");
    }
  }
}

function loadCertificates(): { key?: Buffer; cert?: Buffer } {
  return {
    key: SSL_KEY_PATH ? readFileSync(SSL_KEY_PATH) : undefined,
    cert: SSL_CERT_PATH ? readFileSync(SSL_CERT_PATH) : undefined,
  };
}

const initialCerts = loadCertificates();

const serverOptions: SMTPServerOptions = {
  secure: false,
  key: initialCerts.key,
  cert: initialCerts.cert,
  onData(
    stream: Readable,
    session: SMTPServerSession,
    callback: (error?: Error) => void,
  ) {
    console.log("Receiving email data..."); // Debug statement
    simpleParser(stream, (err, parsed) => {
      if (err) {
        console.error("Failed to parse email data:", err.message);
        return callback(err);
      }

      if (!session.user) {
        console.error("No API key found in session");
        return callback(new Error("No API key found in session"));
      }

      const toAddress = Array.isArray(parsed.to)
        ? parsed.to.map((addr) => addr.text).join(", ")
        : parsed.to?.text;

      const fromAddress = Array.isArray(parsed.from)
        ? parsed.from.map((addr) => addr.text).join(", ")
        : parsed.from?.text;

      // Check if this is a campaign send (to: contactBookId@usesend.com)
      const campaignTarget = parseCampaignTarget(toAddress);

      if (campaignTarget) {
        // This is a campaign send
        console.log(
          `Detected campaign send to contact book: ${campaignTarget.contactBookId}`,
        );

        if (!fromAddress) {
          console.error("No from address found for campaign");
          return callback(new Error("From address is required for campaigns"));
        }

        if (!parsed.subject) {
          console.error("No subject found for campaign");
          return callback(new Error("Subject is required for campaigns"));
        }

        // Campaign API requires html content
        // If no html provided, convert text to basic html
        let htmlContent = parsed.html;
        if (!htmlContent && parsed.text) {
          // Convert plain text to basic HTML, preserving line breaks
          const escapedText = parsed.text
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/\n/g, "<br>\n");
          htmlContent = `<html><body><p>${escapedText}</p></body></html>`;
        }

        if (!htmlContent) {
          console.error("No content found for campaign");
          return callback(
            new Error("HTML or text content is required for campaigns"),
          );
        }

        // Campaign API requires an unsubscribe link placeholder
        // Append one if not already present
        const hasUnsubscribeLink =
          htmlContent.includes("{{unsend_unsubscribe_url}}") ||
          htmlContent.includes("{{usesend_unsubscribe_url}}");

        if (!hasUnsubscribeLink) {
          const unsubscribeFooter = `
<p style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #666;">
  <a href="{{usesend_unsubscribe_url}}" style="color: #666;">Unsubscribe</a>
</p>`;
          // Insert before closing body tag if present, otherwise append
          if (htmlContent.includes("</body>")) {
            htmlContent = htmlContent.replace(
              "</body>",
              `${unsubscribeFooter}</body>`,
            );
          } else {
            htmlContent = htmlContent + unsubscribeFooter;
          }
        }

        const campaignData: CampaignData = {
          name: `SMTP Campaign: ${parsed.subject}`,
          from: fromAddress,
          subject: parsed.subject,
          contactBookId: campaignTarget.contactBookId,
          html: htmlContent,
          replyTo: parsed.replyTo?.text,
        };

        sendCampaignToUseSend(campaignData, session.user)
          .then((response) => {
            console.log(
              `Campaign created and scheduled successfully. Campaign ID: ${response.id}, Status: ${response.status}`,
            );
            callback();
          })
          .catch((error) => {
            console.error("Failed to send campaign:", error.message);
            callback(error);
          });
      } else {
        // Regular email send
        const emailObject = {
          to: toAddress,
          from: fromAddress,
          subject: parsed.subject,
          text: parsed.text,
          html: parsed.html,
          replyTo: parsed.replyTo?.text,
        };

        sendEmailToUseSend(emailObject, session.user)
          .then(() => callback())
          .then(() =>
            console.log("Email sent successfully to: ", emailObject.to),
          )
          .catch((error) => {
            console.error("Failed to send email:", error.message);
            callback(error);
          });
      }
    });
  },
  onAuth(auth, session: any, callback: (error?: Error, user?: any) => void) {
    if (auth.username === AUTH_USERNAME && auth.password) {
      console.log("Authenticated successfully"); // Debug statement
      callback(undefined, { user: auth.password });
    } else {
      console.error("Invalid username or password");
      callback(new Error("Invalid username or password"));
    }
  },
  size: 10485760,
};

function startServers() {
  const servers: SMTPServer[] = [];
  const watchers: FSWatcher[] = [];

  if (SSL_KEY_PATH && SSL_CERT_PATH) {
    // Implicit SSL/TLS for ports 465 and 2465
    [465, 2465].forEach((port) => {
      const server = new SMTPServer({ ...serverOptions, secure: true });

      server.listen(port, () => {
        console.log(
          `Implicit SSL/TLS SMTP server is listening on port ${port}`,
        );
      });

      server.on("error", (err) => {
        console.error(`Error occurred on port ${port}:`, err);
      });

      servers.push(server);
    });
  }

  // STARTTLS for ports 25, 587, and 2587
  [25, 587, 2587].forEach((port) => {
    const server = new SMTPServer(serverOptions);

    server.listen(port, () => {
      console.log(`STARTTLS SMTP server is listening on port ${port}`);
    });

    server.on("error", (err) => {
      console.error(`Error occurred on port ${port}:`, err);
    });

    servers.push(server);
  });

  if (SSL_KEY_PATH && SSL_CERT_PATH) {
    const reloadCertificates = () => {
      try {
        const { key, cert } = loadCertificates();
        if (key && cert) {
          servers.forEach((srv) => srv.updateSecureContext({ key, cert }));
          console.log("TLS certificates reloaded");
        }
      } catch (err) {
        console.error("Failed to reload TLS certificates", err);
      }
    };

    [SSL_KEY_PATH, SSL_CERT_PATH].forEach((file) => {
      watchers.push(watch(file, { persistent: false }, reloadCertificates));
    });
  }
  return { servers, watchers };
}

const { servers, watchers } = startServers();

function shutdown() {
  console.log("Shutting down SMTP server...");
  watchers.forEach((w) => w.close());
  servers.forEach((s) => s.close());
  process.exit(0);
}

["SIGINT", "SIGTERM", "SIGQUIT"].forEach((signal) => {
  process.on(signal, shutdown);
});
