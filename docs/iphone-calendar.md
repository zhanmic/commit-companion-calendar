# Sync the schedule to iPhone Calendar

The site already has **Add to Calendar** (a one-time snapshot of this week or one session). **Sync to iPhone** is different: it subscribes the iPhone Calendar app to a live `.ics` feed. When Commit times change, the phone calendar updates on its next refresh (often a few hours, not instantly).

Production is `myswimday.com`. Delmar’s short team id is `1`.

## Fastest: from the team page

1. Open [https://myswimday.com/1](https://myswimday.com/1) on the iPhone (Safari).
2. Turn on the groups you want (Sr, Jr, Jr Prep, DEVO, …) and Meet / Event if you want those too.
3. Tap **Sync to iPhone** (top right) → **Add to iPhone Calendar**.
4. Confirm the subscribe prompt in Calendar.

The calendar name looks like `Delmar Dolfins · Sr, Jr`. It is a separate calendar you can show/hide in Calendar → Calendars.

If you later change which groups you want, unsubscribe the old one and tap Sync again (the phone does not follow the website chips after you subscribe).

## Paste the URL yourself

Calendar → **Calendars** (at the bottom) → **Add Calendar** → **Add Subscription Calendar** → paste:

Practices for Sr, Jr, Jr Prep, and DEVO, plus meets and events:

`https://myswimday.com/api/calendar?team=1&group=Sr,Jr,Jr%20Prep,DEVO&include=all`

Sr only:

`https://myswimday.com/api/calendar?team=1&group=Sr`

Meets only (no group):

`https://myswimday.com/api/calendar?team=1&include=meets`

On a Mac you can also use the `webcal://` form of the same path. Google Calendar: Settings → Add calendar → From URL → the `https://` link.

## What the feed contains

- Past **7 days** through the next **8 weeks** (add `weeks=12` if you want more, max 12).
- Same public times and locations as the website.
- Practices for the `group=` list; meets and team events only if `include=` asks for them.
- Stable event IDs so updates replace the same session instead of duplicating.

This is not CalDAV and not a login. Anyone with the URL can read that team’s public schedule. Do not put private notes in Commit titles you would not want on a shared calendar.

## If nothing shows up

- Wait for Calendar’s next refresh, or delete the subscription and add it again.
- Confirm the https URL in Safari shows a file download / calendar text starting with `BEGIN:VCALENDAR`.
- If the API is pausing under attack you will get HTTP 429 (same team-size cap as the Siri schedule API).
