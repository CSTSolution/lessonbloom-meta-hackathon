# Version notes

The version is shown next to the logo (`v1.0.<date>.<time, Hanoi>`), so a tester can say which one
they used. Newest first. Each version lists what changed for users; the commits are in `git log`.

## v1.0.20261101.1328 (1 Nov, afternoon)

From the live test of 1310 (a made-up sheet read by the real model):
- A word problem answered with its working ("64 - 28 = 46 (quả)") is judged by the number after the last
  "=", so a right answer written with its working is no longer flagged; the model is asked for the final
  answer only.
- The opening slide shows the child's sums as printed: no trailing "=", and the unit on every number
  ("329 cm + 183 cm = 512 cm").

## v1.0.20261101.1310 (1 Nov, afternoon)

Chi's five priorities of 1 Nov noon:
- **Lessons from a child's work (#54)**: sums with units ("329 cm + 183 cm") and word problems are worked
  out by code; a row whose mark and sum disagree is not a mistake until she chooses Right / Wrong ("1 to
  check"); "Make a lesson from these mistakes" picks the source whose number range reaches the sheet.
- **Video step (#53)**: no tick until the video is there ("being made", "not made yet", "English only").
- **Read again to split into lessons (#48)**: for a book still in one part; from its kept text or PDF for
  free, or from its kept page pictures at the scan price (the estimate first). Each book now keeps its
  page text.
- **English practice (#52)**: matching says "Match each word to its picture."; pictures that read as
  another word are not used; a wrong fill-in's hint is about its gap; numbers in words, built by code.
- **Hints (#50)**: the second wrong try shows the lesson's method from the numbers, the third the whole
  working; advice leads with the newest repeated mistake; "Learning now" is the lesson assigned last;
  mistake labels follow the screen's language.

## v1.0.20261101.1213 (1 Nov, noon)

- **Videos for English lessons only, for now** (Chi #49): the server's Vietnamese voice loads a model of
  more than 1.4 GB, which ran the shared server out of memory twice. A Vietnamese lesson makes no video;
  "Listen to each part" and the child's "Listen to the question" use the browser's own voice.
  `LB_VI_VOICE=1` turns the server's Vietnamese voice back on.
- **The child's page says when the connection is lost** ("Connection lost. Your answers so far are
  saved." with Try again) instead of standing still; an answer not sent can be given again, and a lost
  connection no longer sends the child to the join screen.
- Pausing the read-aloud stops it.

## v1.0.20261101.1129 (1 Nov, late morning)

Fixes from the live test of v1.0.20261101.1113:
- **A worksheet finds its part of the book by its mistakes**: a sheet headed only "Đặt tính rồi tính"
  found nothing; the search now adds its most frequent mistake as books word it ("phép cộng có nhớ,
  adding with regrouping"). Tried live: Lesson 21 found with no part chosen.
- **Drafts are kept per account**: a new account in the same browser was offered another's "Continue".
- "Not in your knowledge area yet" no longer stays under "Found" once a part is chosen by hand.
- Marked work with no lesson assigned yet shows its mistakes in the account's language.

## v1.0.20261101.1113 (1 Nov, morning)

- **The same book added twice** (file fingerprint made in the browser): "This book is already in your
  library: '…' (added …)" with "Open the existing book" (no credits) or "Add a new copy anyway". (Chi #44)
- **Page numbers as printed in the book**: read with each page; "page N in the file" in View source; a
  book with none read can be told once where its page 1 is. (Chi #45)
- **Lessons from a child's marked work** (Chi's three layers): the photo is read into a table (question,
  what the child wrote, right answer, kind of mistake) the parent can correct; it is kept as a dated
  record on the child's profile (My children → Work), counts in the summary, and the lesson opens with the
  child's own wrong sums and practises them first, "Made for <child> · from the work of <date>". (Chi #46)
- **Number range of the part** (to 1000) for practice, with column sums; items far below it are rejected.
  (Chi #47)
- **Books whose lessons have no number** (Cánh Diều, Chân trời sáng tạo: a title in capitals at the top of
  the page) are split into their lessons. (Chi #48)

## v1.0.20261031.2215 (31 Oct, evening)

- **The server no longer runs out of memory while making videos** (31 Oct, 9:00–9:30: lessons failed with
  504/524 for ~30 min). Chromium no longer depends on Docker's small /dev/shm, the app has 2.5 GB instead
  of 1.5 GB, ffmpeg uses 2 threads, and a broken database connection is dropped and tried again instead of
  hanging every request.
- **Slides are checked by code** (Chi, 31 Oct): a title that contradicts its content ("greater than 60,
  less than 50"), a wrong sum, or units that do not match are written again once, and the slide keeps a
  mark "Fixed automatically: …" (or "Please check: …") for the assigner to read before assigning.
- **"Are you sure?" inside the app**, in her language (Unassign, remove a source or an item, delete a
  class), instead of the browser's own box. (Chi #34)
- **Continue opens the step she left** a lesson on; the Lessons page offers only the most recent
  unfinished work, "Continue: <title> · <step>"; an empty draft is not kept. Leaving a lesson not yet
  assigned shows "The lesson is kept in Lessons → Drafts" for 4 s. A card's picture is labelled
  "Example". (Chi #37, #43)
- **A link to a lesson or learner that is not there** (or another account's) says so, with "Back to
  Lessons", instead of an empty page; signing in or up always lands on Lessons. (Chi #38)
- **No book yet**: "+ New lesson" explains and offers Upload a book, Photos of pages, or a sample book
  (added in one tap, back on the same step). (Chi #39)
- **A chosen part makes the material optional**: the material box folds away, the button reads "Make the
  lesson from this part". (Chi #40)
- **Add a source guesses the subject and grade** from the file name ("Toán 2" → Maths · Grade 2) and no
  longer presets Maths; "Maths and English, grades 1–5, for now". (Chi #41)
- **"Works best in Google Chrome"** on top in other browsers (closable), on the welcome page and at the
  upload box; not on the child's pages, which must work in Safari on an iPhone. (Chi #42)

## v1.0.20261030.2225 (30 Oct, late)

- **A lesson holds 90 credits** and usually uses about 65; the rest comes back (Son, 31 Oct: real lessons
  cost ~64, the most seen 89). When work costs more than it held, the Usage page says "Charged extra
  (over the hold)", not "Given back" with a minus. (Chi #23)
- Drafts come first on the Lessons page and are open: a lesson just made is found there ("Drafts · not
  assigned yet"). A lesson being made opens from the "Working on" list. A card no longer shows its title
  twice.
- The knowledge map is no longer hidden behind an open "View source".
- The learning path says "✓ Path saved at 18:40" in green, "Not saved" in orange. (Chi #35)
- The progress lines while a lesson is made say why items were turned down: "kept 2 · 5 rejected by the
  checker (wrong answer, duplicate), written again". (Chi #36)
- A lesson's title in a book reads one way: "Bài 6: Luyện tập chung" (with a colon, not in capitals),
  for books added from now on.

## v1.0.20261030.2153 (30 Oct, night)

- **A photo or page with no lesson heading becomes one part**, named after the source, so a lesson can
  always be made from it. (Chi #25)
- **Not enough credits for a lesson is said first.** The new-lesson page shows "You have X credits; a
  lesson needs 60" before any step that costs credits, with a promo code box right there. Finding the
  part and the setup step spend nothing then. (Chi #30, #23)
- **An unfinished lesson is kept**: step 1 is saved in the browser as she works; coming back opens it
  again without looking for the part (and paying) again; the Lessons page offers "Carry on". (Chi #30)
- **The account menu closes by itself** (a click outside, Esc, another page) and no longer stretches
  across the screen. (Chi #30)
- **English practice has one right answer**: a fill-in sentence must name what settles it ("The sky is
  ___."); opinion sentences ("My favourite colour is ___.") and empty ones ("It is ___.") are written
  again; a colour is matched to its swatch, not a thing of that colour; harder levels never copy the
  basic one. (Chi #31)
- **Parents get the Video step** before Practice, so they see the video before their child does; the
  confirm box names the video too. (Chi #32)
- **Assigned is clear**: a green card "Assigned to …" replaces the button, with the child's or class's
  link and the learning path. (Chi #33)
- **Unassign**: each assigned lesson has "Unassign"; it leaves the child's list, the answers stay in
  the Summary. Assigning the same lesson again warns first. The status follows what was done: Just
  assigned, In progress, Done. (Chi #34)
- **Learning path**: 1/2/3 weeks moves every later lesson at once and saves by itself; a new path
  follows the book's page order. (Chi #35)
- The empty Knowledge page: one "+ Add a source" button, the sample books below. (Chi #27)
- A scan's estimate includes the fixed part of each reading (one photo: about 2); after reading, "Used
  X credits · Y given back" shows next to "Added". (Chi #29)
- No emoji left (the Speak button and others). Photos are recognised by name too (Safari). (Chi #24, #26)

## v1.0.20261030.2120 (30 Oct, evening)

- **Scanned textbooks are cut into the right lessons.** A lesson number printed in a badge, with its
  title on the next line ("Bài 1" / "ÔN TẬP CÁC SỐ ĐẾN 100"), now starts a lesson. A contents page (one
  listing 4 or more lessons) no longer starts any. Titles printed in capitals read as sentences. The page
  reader writes a lesson's number and title on one line. Books read before this must be added again.
  (Son's SGK Toán 2; Chi #28)
- Behind the scenes: the deploy no longer stops when a test only ran out of time on a busy build Mac.

## v1.0.20261030.1342 (30 Oct, afternoon)

- The knowledge map draws itself again when a book finishes reading (opened while the book was still
  being read, it stayed empty).

## v1.0.20261030.1239 (30 Oct, midday)

- **Lessons hold 60 credits** when they start, pictures and video included, and give back what they do
  not use. Holds and refunds show on the Usage page. (Chi #23)
- **View source**: each part of a book, page by page, the original page beside the text read from it.
- **Knowledge map**: book → parts → lessons → skills; click a part to see its source, a lesson to open it.
- **Original files kept privately in Cloudflare R2**: page pictures of scans and photos, and the
  original of a big PDF. 300 MB per account, shown on the Usage page; deleted with their source.
- **A PDF the browser cannot open** (Safari, very big files) goes to R2 and is read on our server. (Chi #20)
- A scanned book's page pictures are kept before it shows as ready.
- The book on the right follows the subject filter. (Chi #22)
- A child's page opens in the lessons' language, without the repeated name; a parent's lessons talk to
  parent and child; an answer one away gets "So close!"; the answer box is not cut on phones; no emoji;
  the top bar fits on one line at about 1,020 px. (Chi #24)

## v1.0.20261030.0937 (30 Oct, morning)

- The version next to the logo.
- **A book is read whole or not at all**: stopped, or short of credit, nothing is kept and the credit
  comes back. No more "read only the first N pages".
- One- and two-page scans and single photos are read (they read nothing before). (Chi #21)
- PDFs open in more browsers (the pdf.js build that runs on Safari).
- Scanned pages turned sideways, or two pages side by side, are read the right way up.
