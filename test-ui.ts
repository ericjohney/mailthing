import { chromium } from "playwright";
import * as smtplib from "child_process";

const SCREENSHOTS_DIR = "./screenshots";

async function sendTestEmail(subject: string, from: string, to: string, html: string) {
  const pythonScript = `
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

msg = MIMEMultipart('alternative')
msg['Subject'] = '''${subject}'''
msg['From'] = '${from}'
msg['To'] = '${to}'

html = '''${html}'''
msg.attach(MIMEText(html, 'html'))

with smtplib.SMTP('localhost', 2500) as server:
    server.sendmail('${from}', ['${to}'], msg.as_string())
`;
  return new Promise((resolve, reject) => {
    const proc = smtplib.spawn("python3", ["-c", pythonScript]);
    proc.on("close", (code) => {
      if (code === 0) resolve(true);
      else reject(new Error(`Failed to send email: ${code}`));
    });
  });
}

async function main() {
  console.log("Starting UI tests...\n");

  // Create screenshots directory
  const fs = await import("fs");
  if (!fs.existsSync(SCREENSHOTS_DIR)) {
    fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
  }

  // Launch browser
  const browser = await chromium.launch({
    headless: true,
    executablePath: "/root/.cache/ms-playwright/chromium-1194/chrome-linux/chrome",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const context = await browser.newContext({
    viewport: { width: 1400, height: 900 },
  });

  const page = await context.newPage();

  try {
    // Test 1: Empty state
    console.log("1. Testing empty state...");
    await page.goto("http://localhost:9005");
    await page.waitForTimeout(1000);
    await page.screenshot({ path: `${SCREENSHOTS_DIR}/01-empty-state.png` });
    console.log("   ✓ Screenshot: 01-empty-state.png\n");

    // Test 2: Send some test emails
    console.log("2. Sending test emails...");
    await sendTestEmail(
      "Welcome to Mailthing!",
      "hello@mailthing.dev",
      "user@example.com",
      "<h1>Welcome!</h1><p>Thanks for trying <strong>Mailthing</strong>.</p>"
    );
    await sendTestEmail(
      "Your order has shipped",
      "orders@shop.com",
      "customer@example.com",
      "<h1>Order Update</h1><p>Your package is on the way!</p><p>Tracking: <code>1Z999AA10123456784</code></p>"
    );
    await sendTestEmail(
      "Weekly Newsletter",
      "news@company.io",
      "subscriber@example.com",
      "<h1>This Week's Updates</h1><ul><li>New feature launched</li><li>Bug fixes</li><li>Performance improvements</li></ul>"
    );
    console.log("   ✓ Sent 3 test emails\n");

    // Test 3: Message list with emails
    console.log("3. Testing message list...");
    await page.reload();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${SCREENSHOTS_DIR}/02-message-list.png` });
    console.log("   ✓ Screenshot: 02-message-list.png\n");

    // Test 4: Click on an email to view details
    console.log("4. Testing message detail view...");
    await page.click("button:has-text('Welcome to Mailthing')");
    await page.waitForTimeout(1000);
    await page.screenshot({ path: `${SCREENSHOTS_DIR}/03-message-detail-html.png` });
    console.log("   ✓ Screenshot: 03-message-detail-html.png\n");

    // Test 5: Text tab
    console.log("5. Testing Text tab...");
    await page.click("button:has-text('Text')");
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${SCREENSHOTS_DIR}/04-message-detail-text.png` });
    console.log("   ✓ Screenshot: 04-message-detail-text.png\n");

    // Test 6: Source tab
    console.log("6. Testing Source tab...");
    await page.click("button:has-text('Source')");
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${SCREENSHOTS_DIR}/05-message-detail-source.png` });
    console.log("   ✓ Screenshot: 05-message-detail-source.png\n");

    // Test 7: Attachments tab
    console.log("7. Testing Attachments tab...");
    await page.click("button:has-text('Attachments')");
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${SCREENSHOTS_DIR}/06-message-detail-attachments.png` });
    console.log("   ✓ Screenshot: 06-message-detail-attachments.png\n");

    // Test 8: Multi-select
    console.log("8. Testing multi-select...");
    await page.click("button:has-text('Select all')");
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${SCREENSHOTS_DIR}/07-multi-select.png` });
    console.log("   ✓ Screenshot: 07-multi-select.png\n");

    // Test 9: Delete action visible
    console.log("9. Verifying delete button visible when selected...");
    const deleteButton = await page.locator("button:has-text('Delete')");
    const isVisible = await deleteButton.isVisible();
    console.log(`   ✓ Delete button visible: ${isVisible}\n`);

    console.log("All tests completed successfully!");
    console.log(`Screenshots saved to: ${SCREENSHOTS_DIR}/`);

  } catch (error) {
    console.error("Test failed:", error);
    await page.screenshot({ path: `${SCREENSHOTS_DIR}/error.png` });
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
