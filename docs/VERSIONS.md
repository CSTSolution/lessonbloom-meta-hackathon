# Version notes

The version is shown next to the logo (`v1.0.<date>.<time, Hanoi>`), so a tester can say which one
they used. Newest first. Each version lists what changed for users; the commits are in `git log`.

## NEXT (30 Oct, night)

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
