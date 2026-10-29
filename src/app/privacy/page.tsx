import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/legal/LegalPage";

export const metadata: Metadata = {
  title: "Privacy notice — LoyaltyPlatform",
  description: "What we collect when you use a loyalty card, why, how long we keep it, and your rights.",
};

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy notice" meta="Last updated 29 October 2026">
      <p>
        This notice explains what information is collected when you use a digital loyalty card on LoyaltyPlatform, why it&rsquo;s
        collected, how long it&rsquo;s kept and what you can do about it.
      </p>

      <h2>Who is responsible</h2>
      <p>
        Each shop runs its own loyalty programme and decides how your points and rewards work. The shop is responsible for the
        information it holds about you as its customer. LoyaltyPlatform provides the software and stores that information on the
        shop&rsquo;s behalf.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li>Your name and email address, so you can sign in and the shop can recognise you.</li>
        <li>Your customer ID and the QR code on your card, so staff can find you at the till.</li>
        <li>Your birthday (day and month only, never the year), if you choose to add it, so the shop can give you a birthday treat.</li>
        <li>Your points history: when you earned or spent points, how much, at which location and which staff member did it.</li>
        <li>Messages you send to the shop and problems you report about your points.</li>
        <li>Your choices: whether you accepted the programme terms and whether you want marketing emails.</li>
        <li>Which of the shop&rsquo;s links (for example its review page) you open, without your IP address or device details.</li>
      </ul>
      <p>We never ask for payment card details and your QR code doesn&rsquo;t contain any personal information.</p>

      <h2>Why we use it</h2>
      <ul>
        <li>To run the loyalty card you joined: adding points, showing your balance and giving you rewards.</li>
        <li>To stop mistakes and misuse, such as the same points being given twice.</li>
        <li>To send emails you need, like a password reset link.</li>
        <li>To send offers from the shop, only if you said yes. You can change this any time.</li>
      </ul>

      <h2>How long we keep it</h2>
      <ul>
        <li>Your account and points history: while your card is active, so your balance stays correct.</li>
        <li>Link click records: 13 months.</li>
        <li>Messages, feedback and audit records of staff actions: 24 months.</li>
        <li>Sign-in sessions: removed as soon as they expire.</li>
      </ul>
      <p>
        If you delete your account, your name and email are removed straight away. A record of past points with no personal
        details may be kept so the shop&rsquo;s accounts still add up.
      </p>

      <h2>Your rights</h2>
      <p>You can, at any time:</p>
      <ul>
        <li>
          Download a copy of your information, change your marketing choices or delete your account on the{" "}
          <Link href="/me">Your data</Link> page.
        </li>
        <li>Ask the shop to correct something that&rsquo;s wrong, using the &ldquo;Something not right?&rdquo; link on your card.</li>
        <li>Complain to your local data protection authority (in the UK, the Information Commissioner&rsquo;s Office).</li>
      </ul>

      <h2>Cookies</h2>
      <p>
        We use one essential cookie to keep you signed in. It&rsquo;s encrypted and contains no personal information. We don&rsquo;t
        use advertising or tracking cookies.
      </p>

      <h2>Changes</h2>
      <p>If this notice changes in a way that affects you, we&rsquo;ll show the new version here with a new date.</p>
    </LegalPage>
  );
}
