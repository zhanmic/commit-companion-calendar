import { LEGAL_EFFECTIVE_DATE } from './legalMeta'
import { PRODUCT_CONTACT_EMAIL, PRODUCT_NAME } from '../product'

export type LegalSection = {
  id: string
  title: string
  paragraphs?: string[]
  bullets?: string[]
  subsections?: { title: string; paragraphs?: string[]; bullets?: string[] }[]
}

export type LegalDocument = {
  slug: string
  title: string
  lede: string
  sections: LegalSection[]
}

const contact = PRODUCT_CONTACT_EMAIL

export const serviceDocument: LegalDocument = {
  slug: 'service',
  title: 'Service description',
  lede: `What ${PRODUCT_NAME} includes, what it does not, and the Commit Swimming prerequisite. Effective ${LEGAL_EFFECTIVE_DATE}.`,
  sections: [
    {
      id: 'overview',
      title: 'Overview',
      paragraphs: [
        `${PRODUCT_NAME} is a companion calendar for swim teams that already use Commit Swimming. It syncs from Commit’s public schedule data and presents a mobile week/month view plus optional email digests. It does not replace Commit.`,
        `${PRODUCT_NAME} is an independent product and is not affiliated with, endorsed by, or part of Commit Swimming.`,
      ],
    },
    {
      id: 'prerequisite',
      title: 'Commit Swimming prerequisite',
      paragraphs: [
        'Service is available only if all of the following are true:',
      ],
      bullets: [
        'Your team uses Commit Swimming with a working public team website / super-team id that My Swim Day can read.',
        'You keep practice, meet, and event data accurate in Commit. My Swim Day mirrors that data; it does not correct or rewrite Commit on your behalf.',
        'You accept that practice and meet title conventions may need a one-time parser setup so groups and details display correctly.',
      ],
      subsections: [
        {
          title: 'When Commit is wrong or unavailable',
          paragraphs: [
            'If Commit access breaks, schedule data in Commit is incorrect, Commit changes or removes public API access, or private Commit data is not exposed publicly, My Swim Day is not liable for missed practices, wrong times, parent inconvenience, or related losses. Remedies are limited to best-effort repair and, where applicable, subscription credit or cancellation — not damages.',
          ],
        },
      ],
    },
    {
      id: 'included',
      title: 'Included',
      bullets: [
        `Hosted team calendar at myswimday.com/{slug}`,
        'Sync from Commit’s public schedule API (practices, meets, and team events as configured for your tenant)',
        'Mobile week and month views, group filters, shareable week links, and .ics add-to-calendar',
        'Optional daily or weekly email digests (double opt-in) for parents and coaches',
        'Initial tenant setup: slug, timezone, groups, and practice/meet parsers for your Commit titles',
        'Support for outages and sync issues per the Support policy',
      ],
    },
    {
      id: 'not-included',
      title: 'Not included',
      bullets: [
        'Commit Swimming itself, Commit licenses, or Commit admin support',
        'Coaching, meet entry, registration, billing of swimmers, or team CRM',
        'Guaranteed real-time sync (near-live best effort from public Commit data)',
        'Custom native apps, SSO, or private/authenticated calendars (unless sold separately later)',
        'Editing or correcting schedule data inside Commit on your behalf',
        'SMS, push notifications, or unlimited email volume beyond fair use',
        'Legal advice',
      ],
    },
    {
      id: 'plans',
      title: 'Plans and payment',
      paragraphs: [
        'Subscriptions are sold per team (tenant), typically monthly via Stripe, after a free pilot when parsers and calendar QA are complete. Contact sales to subscribe. Payment terms and acceptance of the Terms of Service are required before paid go-live.',
      ],
    },
    {
      id: 'contact',
      title: 'Questions',
      paragraphs: [
        `Email ${contact} with your team name and Commit team details.`,
      ],
    },
  ],
}

export const supportDocument: LegalDocument = {
  slug: 'support',
  title: 'Support policy',
  lede: `How to report issues and what response and resolution targets to expect. Effective ${LEGAL_EFFECTIVE_DATE}.`,
  sections: [
    {
      id: 'channel',
      title: 'Support channel',
      paragraphs: [
        `Email only: ${contact}. Use subject tags when possible: [Outage], [Sync], [Billing], or [Setup].`,
        'Targets below are business days, US Eastern, and are goodwill targets — not hard SLA credits — unless we agree otherwise in writing.',
      ],
    },
    {
      id: 'severity',
      title: 'Severity and targets',
      subsections: [
        {
          title: 'P1 — Outage',
          paragraphs: [
            'Examples: site down, digests not sending for all tenants, calendar blank for all teams.',
            'First response: within 4 business hours. Resolution target: 1 business day.',
          ],
        },
        {
          title: 'P2 — Team broken',
          paragraphs: [
            'Examples: one tenant wrong or empty after a Commit change, parser mismatch, digest wrong for that club only.',
            'First response: within 1 business day. Resolution target: 2–3 business days.',
          ],
        },
        {
          title: 'P3 — Request',
          paragraphs: [
            'Examples: new group filter, copy tweak, feature ask, billing receipt.',
            'First response: within 2 business days. Resolution: best effort / next release.',
          ],
        },
      ],
    },
    {
      id: 'commit-sourced',
      title: 'Commit-sourced errors',
      paragraphs: [
        'Wrong times entered in Commit, Commit API downtime, or private Commit data that is not public are not P1 issues on My Swim Day. Fix the data or access in Commit first; we will verify sync once Commit is correct.',
      ],
    },
    {
      id: 'customer',
      title: 'What we ask of you',
      bullets: [
        'Designate one team admin contact',
        'Include tenant slug, approximate time, screenshot, and whether the Commit website shows the same data',
        'Treat Commit as the authoritative schedule source',
      ],
    },
  ],
}

export const termsDocument: LegalDocument = {
  slug: 'terms',
  title: 'Terms of service',
  lede: `Agreement between you (the swim team / customer) and ${PRODUCT_NAME}. Effective ${LEGAL_EFFECTIVE_DATE}. Have counsel review before relying on these terms for paid production use.`,
  sections: [
    {
      id: 'acceptance',
      title: 'Acceptance',
      paragraphs: [
        `By using ${PRODUCT_NAME}, requesting a pilot, or paying for a subscription, you agree to these Terms, the Service description, the Support policy, and the Privacy policy. If you do not agree, do not use the service.`,
      ],
    },
    {
      id: 'eligibility',
      title: 'Eligibility and Commit prerequisite',
      paragraphs: [
        'You represent that you are authorized to act for the swim team, that the team uses Commit Swimming with a readable public schedule, and that you will keep Commit data accurate. Service may be refused or suspended if the Commit prerequisite is not met.',
      ],
    },
    {
      id: 'service',
      title: 'The service',
      paragraphs: [
        `We provide the features described in the Service description on a best-effort basis. Features may change. We do not guarantee uninterrupted availability, real-time sync, or that parsers will match every future Commit title format without adjustment.`,
        `${PRODUCT_NAME} is not affiliated with Commit Swimming.`,
      ],
    },
    {
      id: 'customer-duties',
      title: 'Your responsibilities',
      bullets: [
        'Maintain accurate schedules in Commit',
        'Obtain any consent required to email parents or coaches digests',
        'Keep payment current for paid tenants',
        'Designate an admin contact for support',
        'Do not abuse, scrape, resell, or interfere with the service or APIs',
      ],
    },
    {
      id: 'payment',
      title: 'Payment',
      paragraphs: [
        'Paid subscriptions are billed per team through Stripe (or invoice when we agree). Fees are non-refundable except where required by law or as we expressly offer (for example, a goodwill credit). Non-payment may result in suspension of digests and/or the hosted calendar after any grace period we communicate.',
      ],
    },
    {
      id: 'acceptable-use',
      title: 'Acceptable use',
      paragraphs: [
        'You may not use the service for spam, unlawful content, unauthorized access, reverse engineering beyond applicable law, or anything that harms other tenants or the infrastructure.',
      ],
    },
    {
      id: 'disclaimer',
      title: 'Disclaimer of warranties',
      paragraphs: [
        `THE SERVICE IS PROVIDED “AS IS” AND “AS AVAILABLE.” TO THE MAXIMUM EXTENT PERMITTED BY LAW, WE DISCLAIM ALL WARRANTIES, EXPRESS OR IMPLIED, INCLUDING MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT. WE DO NOT WARRANT THAT SCHEDULE DATA WILL BE COMPLETE, CURRENT, OR FREE OF ERRORS INTRODUCED IN COMMIT OR IN TRANSIT.`,
      ],
    },
    {
      id: 'liability',
      title: 'Limitation of liability',
      paragraphs: [
        `TO THE MAXIMUM EXTENT PERMITTED BY LAW, ${PRODUCT_NAME.toUpperCase()} AND ITS OPERATORS WILL NOT BE LIABLE FOR INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR FOR LOST PROFITS, MISSED PRACTICES OR MEETS, CARPOOL ISSUES, REGISTRATION ERRORS, OR DATA LOSS, WHETHER BASED IN CONTRACT, TORT, OR OTHERWISE.`,
        'OUR TOTAL LIABILITY FOR ANY CLAIM ARISING OUT OF OR RELATING TO THE SERVICE WILL NOT EXCEED THE FEES YOU PAID TO US FOR THE SERVICE IN THE TWELVE (12) MONTHS BEFORE THE CLAIM. IF YOU USE A FREE PILOT ONLY, OUR TOTAL LIABILITY IS ZERO TO THE EXTENT PERMITTED BY LAW.',
      ],
    },
    {
      id: 'indemnity',
      title: 'Indemnity',
      paragraphs: [
        'You will defend and indemnify us against claims arising from your Commit content, your emails to parents/coaches, your misuse of the service, or your breach of these Terms.',
      ],
    },
    {
      id: 'termination',
      title: 'Suspension and termination',
      paragraphs: [
        'We may suspend or terminate access for non-payment, abuse, loss of the Commit prerequisite, or material breach. You may cancel via the Stripe Customer Portal or by emailing sales; access continues through the paid period unless we agree otherwise.',
      ],
    },
    {
      id: 'changes',
      title: 'Changes',
      paragraphs: [
        'We may update these Terms by posting a new effective date on this page. Continued use after changes constitutes acceptance. Material changes for paying customers will be communicated to the admin contact when practical.',
      ],
    },
    {
      id: 'contact',
      title: 'Contact',
      paragraphs: [`Questions: ${contact}.`],
    },
  ],
}

export const privacyDocument: LegalDocument = {
  slug: 'privacy',
  title: 'Privacy policy',
  lede: `How ${PRODUCT_NAME} collects and uses information. Effective ${LEGAL_EFFECTIVE_DATE}.`,
  sections: [
    {
      id: 'controller',
      title: 'Who we are',
      paragraphs: [
        `${PRODUCT_NAME} (myswimday.com) operates this service. Contact: ${contact}.`,
      ],
    },
    {
      id: 'collect',
      title: 'What we collect',
      bullets: [
        'Contact and sales email you send to us (forwarded to our inbox)',
        'Email addresses and preference settings when someone subscribes to schedule digests (tenant, frequency, group filters, meet/event toggles)',
        'Confirmation and unsubscribe tokens needed to run double opt-in digests',
        'Billing-related information processed by Stripe when you subscribe (we do not store full card numbers on our servers)',
        'Technical logs typical of hosting (IP, user agent, error logs) from our providers',
        'Public schedule data read from Commit Swimming’s public APIs for your team',
      ],
    },
    {
      id: 'use',
      title: 'How we use it',
      bullets: [
        'Provide calendars, digests, and support',
        'Onboard and bill team subscriptions',
        'Prevent abuse and keep the service reliable',
        'Respond to sales and support requests',
      ],
    },
    {
      id: 'share',
      title: 'Processors and sharing',
      paragraphs: [
        'We use infrastructure and email providers (for example Vercel, Upstash Redis, Resend) and Stripe for payments. We do not sell personal information. We may disclose information if required by law or to protect the service and users.',
      ],
    },
    {
      id: 'retention',
      title: 'Retention',
      paragraphs: [
        'Digest subscriptions are kept until the subscriber unsubscribes or the tenant is removed. Sales email and billing records are kept as needed for operations and legal requirements.',
      ],
    },
    {
      id: 'rights',
      title: 'Your choices',
      paragraphs: [
        'Digest subscribers can unsubscribe via the link in every email or the schedule UI. Team admins can email us to update billing contact details or request deletion of operational records where we are not required to keep them.',
      ],
    },
    {
      id: 'children',
      title: 'Children',
      paragraphs: [
        'The service is directed at coaches, team admins, and parents. We do not knowingly collect account data from children under 13. Schedule content may list practice groups that include minors; that content originates from the team’s Commit schedule.',
      ],
    },
    {
      id: 'changes',
      title: 'Changes',
      paragraphs: [
        'We may update this policy by posting a new effective date on this page.',
      ],
    },
  ],
}

export const LEGAL_DOCUMENTS: Record<string, LegalDocument> = {
  service: serviceDocument,
  support: supportDocument,
  terms: termsDocument,
  privacy: privacyDocument,
}
