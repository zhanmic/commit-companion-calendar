# Siri Shortcut for the public schedule API

There is no downloadable `.shortcut` file. iPhone Shortcuts cannot be stored in git the way a webpage can. You build a one-time Shortcut that calls the live API; Siri then runs it by name.

Production is on `myswimday.com`. Delmar’s short team id is `1` (same as [myswimday.com/1](https://myswimday.com/1)).

## Finding “Get Contents of URL”

It is **not** on the first suggested list. You have to search.

1. Open the **Shortcuts** app (dark icon with overlapping squares). Not Safari, not Settings.
2. Tap **+** (new shortcut).
3. Tap the **search field** at the bottom (“Search Actions” / “Add Action”).
4. Type **`contents of url`** (or just **`url`**).
5. Choose **Get Contents of URL** — it sits in the **Web** category.

Do **not** pick **Open URLs** (opens Safari) or **Get Contents of Web Page** (scrapes a website).

If search still shows nothing:

1. Search **`URL`** and add the **URL** action first.
2. Paste the address into that URL action.
3. Search again for **`contents`**. Shortcuts usually offers **Get Contents of URL** once a URL is on the canvas.

On some phones the action is listed as **Get Contents of URLs** (plural). Same thing.

## Fastest version: “Hey Siri, senior practice”

Always answers **today** for Delmar Sr.

1. New shortcut → search **`contents of url`** → **Get Contents of URL**.
2. Tap **URL** inside that action and paste (leave Method as **GET**; tap **Show More** if you do not see Method):

   `https://myswimday.com/api/schedule?team=1&group=Sr&date=today&format=spoken`

3. Search **`speak`** → add **Speak Text**. Tap the text field → **Contents of URL** (the previous action).
4. Tap the shortcut name at the top, rename it **Senior practice**.
   Siri uses that name: “Hey Siri, senior practice.”
5. (Optional) Shortcut settings (ⓘ) → add to Home Screen / allow on **Apple Watch** and **HomePod**.

Test with the play button in Shortcuts first. You should hear something like: *Sr practice for Delmar Dolfins today is 6:00 PM to 8:00 PM at Albany Academy.*

## Ask which day: today / tomorrow / this Friday / next Monday

1. New Shortcut, name it **Swim practice**.
2. Add **Choose from Menu** with these items (labels can be nicer; the **text you pass to the URL** must match the API):

   | Menu label     | Value passed to `date=` |
   |----------------|-------------------------|
   | Today          | `today`                 |
   | Tomorrow       | `tomorrow`              |
   | This Friday    | `this Friday`           |
   | Next Monday    | `next Monday`           |

3. Under each menu branch, add **Text** whose only content is that `date=` value (`today`, `tomorrow`, `this Friday`, `next Monday`).
4. After the menu (so it runs for every choice), add **Get Contents of URL**.
5. URL — use **Text** from the menu, URL-encoded. Easiest reliable pattern:

   Add **URL** or **Get Contents of URL** with:

   `https://myswimday.com/api/schedule?team=1&group=Sr&date=`

   then insert the **Text** variable, then `&format=spoken`.

   If `this Friday` breaks the request, add **Replace Text**: find ` ` (a space), replace with `%20`, and put *that* into the URL.

6. Add **Speak Text** → **Contents of URL**.

“Hey Siri, swim practice” → Siri shows Today / Tomorrow / This Friday / Next Monday → speaks the answer.

## Other groups

Change `group=Sr` to `Jr`, `Jr%20Prep`, `DEVO`, or nicknames the API already accepts (`senior`, `junior prep`).

Vortex: `team=2` (or `VortexSwimClub`) and a Vortex group such as `Peak`.

## If Siri does nothing

- Run the shortcut from the Shortcuts app (play). If that fails, the URL is wrong.
- Confirm in Safari:

  [https://myswimday.com/api/schedule?team=1&group=Sr&date=today&format=spoken](https://myswimday.com/api/schedule?team=1&group=Sr&date=today&format=spoken)

  You should see one plain-text sentence, not a webpage.
- On HomePod, the shortcut must live in iCloud (signed into the same Apple ID) and **Use with Siri** must be on.
- Do not add an API key. This endpoint is public.

JSON (if you would rather parse Dictionary values instead of `format=spoken`):

`https://myswimday.com/api/schedule?team=1&group=Sr&date=today`

Use **Get Dictionary Value** for `spoken`, or `sessions` → `startTime` / `location`.
