# Version notes

The version is shown next to the logo (`v1.0.<date>.<time, Hanoi>`), so a tester can say which one
they used. Newest first. Each version lists what changed for users; the commits are in `git log`.

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
