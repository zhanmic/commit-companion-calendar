# Sync the schedule to iPhone Calendar

The site already has **Add to Calendar** (a one-time snapshot of this week or one session). **Sync to iPhone** is different: it subscribes the iPhone Calendar app to a live `.ics` feed.

Production is `myswimday.com`. Delmar’s short team id is `1`.

## Fastest: from the team page

1. Open [https://myswimday.com/1](https://myswimday.com/1) on the iPhone (Safari).
2. Turn on the groups you want (Sr, Jr, Jr Prep, DEVO, …) and Meet / Event if you want those too.
3. Tap **Sync to iPhone** (top right) → **Add to iPhone Calendar**.
4. Confirm the subscribe prompt in Calendar.

The calendar is named **Delmar Dolfins** (team name only). In Calendar → Calendars you can show or hide that one calendar. Event titles still include the group (`Sr Practice`, `Jr Practice`).

If you later change which groups you want, unsubscribe the old one and tap Sync again. The phone does not follow the website chips after you subscribe — those chips only choose what goes into the URL at add time.

## Colors and group tags on iPhone

iPhone Calendar **cannot** copy the website group chips or colors.

A subscribed calendar is **one calendar with one color**. You pick that color in Calendar → Calendars (info / edit). iOS does not color Sr vs Jr events, and it does not show checkable group tags the way the website does.

What *does* match the website:

- Which practices are included (from the chips you had on when you tapped Sync).
- Group name on each event title.

If you need separately toggleable calendars (Sr vs Jr, each with its own color), add two subscriptions with different `group=` URLs. That is two calendars, not tags inside one.

## How the phone stays in sync

My Swim Day does **not** push to the phone. There is no Apple account login, no background app, and no notification when Commit changes.

The iPhone stores the feed URL and **re-downloads** it on its own schedule:

1. You add the calendar once (the `https://myswimday.com/api/calendar?…` link).
2. Calendar later GETs that same URL again.
3. The new ICS file replaces events with the same IDs (time/location changes) and drops cancelled sessions.

Apple chooses the poll interval. It is often **hours**, not seconds. The feed asks for about every 6 hours (`REFRESH-INTERVAL`); iOS may ignore that and use its own timing. Pulling down in Calendar does not always force a refresh. To force a refresh, delete the subscription and add it again.

After a coach edits Commit, the website updates within a couple of minutes. The phone updates on the next Calendar fetch after that.

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
