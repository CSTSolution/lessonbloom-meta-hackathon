# Review log: Son and Chi, 29 Oct – 3 Nov 2026

LessonBloom was built by two people: **Son** (engineering) wrote the code; **Chi** (product design) wrote the design documents, tested every build on the live site with real teachers and parents in mind, and filed what she found. This is the record of that loop: each item Chi raised, how important she judged it, and what was done. The review itself was kept in Vietnamese and is kept as written; names of children and test accounts, emails and screenshots are left out.

How the loop ran: Chi filed an item in a shared review table → Son fixed it with a test → it went live in a numbered version (see [VERSIONS.md](VERSIONS.md)) → Chi retested it on live and wrote the result. **Mức** is Chi's priority (Cao = high, Vừa = medium, Thấp = low). **Đã sửa** = fixed; **lên live bản …** = live in that version; **Để sau** = after the contest; **Không làm tiếp** = dropped (from 1 Nov the build focuses on English books).

88 items · 51 replies.

## The items

| # | Mức | Chi raised | Outcome |
|---|---|---|---|
| 1 | Cao | Credit dùng thử quá thấp – Chi chốt mức mới: | Đã sửa (Sơn chốt 29/10): 120 khi đăng ký, cần 35 để tạo bài; giám khảo dùng mã (mã) (5.000) |
| 2 | Vừa | Lộ trình học lệch bài đã giao: | Đã sửa (9de896a) |
| 3 | Vừa | Tải chậm, không có dấu đang tải: | Đã sửa (9de896a) |
| 4 | Vừa | "Server error" | Đã sửa (chờ Chi thử lại) |
| 5 | Vừa | Video quá ngắn: | Đã sửa (1fa99c3) |
| 6 | Vừa | Màn học sinh chưa theo thiết kế: | Đã sửa (417ceea, b35262c) |
| 7 | Thấp | Màn tiến trình tạo bài hiện mã nội bộ "add_carry_100", "carry_1_tens" | Đã sửa (fdadbbb) |
| 8 | Thấp | Kho kiến thức trống ghi "dùng sách mẫu" nhưng nút sách mẫu chỉ có trong "Add a source"; giao bài được khi lớp chưa có học sinh, không cảnh báo | Đã sửa (9de896a) |
| 9 | Thấp | Chữ: | Đã sửa (fdadbbb) |
| 10 | Thấp | Điện thoại: | Đã sửa (417ceea) |
| 11 | Cao | SGK thật không đọc được: | Đã sửa (8534eda): đọc sách scan trên trình duyệt |
| 12 | Vừa | Chi phí đọc sách dạng ảnh (OCR) nếu làm #11: | Đã sửa: đo thật 0,74 lượt/trang |
| 13 | Cao | Luồng credit khi tải sách lên – Chi chốt: | Đã sửa (8534eda): dự kiến, dư 50%, giữ chỗ, trả lại |
| 14 | Cao | Tải PDF lớn bị treo, không báo lỗi: | Đã sửa (9519319, 8534eda) |
| 15 | Vừa | Cách xử lý sách nặng (trên 30 MB, kể cả trên 100 MB) và tính tiền dung lượng kho – Chi đề xuất: | Đã giải quyết: không cần kho file (chỉ giữ chữ); sách lớn đọc trên trình duyệt |
| 16 | Vừa | Câu về Thông tư 27 – Chi chốt: | Đã sửa (c76e55b): bỏ số hiệu Thông tư, có bản cô và bản phụ huynh |
| 17 | Cao | Tải tài liệu lên Kho kiến thức không biết thành công hay chưa – Chi báo: | Đã sửa (c76e55b): Đang chờ / Đang đọc trang k/N / Đã thêm · N bài · M trang / lý do + Thử lại; chuông báo khi xong |
| 18 | Cao | Kho kiến thức không nhận ảnh chụp màn hình / ảnh trang sách – Chi báo: | Đã sửa (c76e55b): nhận ảnh JPG/PNG/WEBP/HEIC, mỗi ảnh một trang, chọn số trang đầu |
| 19 | Cao | Mã credit cho người dùng thử – Chi nhờ: | Đã sửa (e236732, 9a9e5b5): mã (mã) (200 lượt, 6 lần, đến hết 11/11); trang Testers trong admin; ô nhập mã ở Lượt dùng |
| 20 | Cao | Tải cả quyển SGK 100 MB báo "This file could not be opened. Please choose a PDF." – Chi báo 30/10: | Đã sửa (b9dfd85, 8f624e3): pdf.js bản chạy trên Safari; trình duyệt không mở được thì gửi tệp vào nơi lưu riêng (R2) và máy chủ đọc; chữ trên ô tải đúng với giới hạn thật |
| 21 | Cao | Ảnh trang sách tải lên được nhưng không đọc ra chữ: | Đã sửa (3b01b0a): lỗi đọc sách 1–2 trang; đã thử trên live: ảnh 1 trang đọc ra "Bài 9: Bảng cộng (qua 10)" |
| 22 | Vừa | Lọc môn ở Kho kiến thức: | Đã sửa (4bde456) |
| 23 | Vừa | Chi phí thật một bài cao hơn số ghi: | Đã sửa (7b7c842): mỗi bài giữ 60 lượt (kèm hình), xong trả lại phần thừa |
| 24 | Thấp | Ngôn ngữ và chữ: | Đã sửa (4bde456): cả 7 ý |
| 25 | Cao | Ảnh một trang đọc xong nhưng ra 0 bài, không tạo bài được: | Đã sửa (bản 2153): nguồn không có tiêu đề bài thành 1 phần, tên theo tên nguồn |
| 26 | Cao | Safari: file gì cũng báo không phải PDF – Chi báo 30/10 (sau bản v1.0.20261030): | Đạt một phần (Chi thử 31/10, bản 2225): Safari tải PDF qua đường dự phòng, đọc xong ra bài, tạo bài được; thiếu dự kiến lượt và tiến trình trang. Không sửa thêm trong đợt thi, nhắc dùng Chrome (#42). Bản 1101.1424: tìm ra nguyên nhân: máy chủ coi sách scan có ít chữ đánh máy là "sách có chữ" (khác cách Chrome xét), nên bỏ bước dự kiến lượt và tiến trình. Nay xét giống Chrome: trên Safari có chọn trang, dự kiến lượt, … |
| 27 | Thấp | Kho kiến thức trống: 3 nút sách mẫu trông như sách đã có – Chi chốt bố cục 30/10: | Đã sửa (bản 2153) |
| 28 | Cao | Chia bài sai: app lấy trang MỤC LỤC làm bài – Chi báo 30/10: | Đã sửa (73c9e95, bản 2120): bỏ qua trang Mục lục; "Bài N" lấy tên ở dòng dưới. Sách cũ cần tải lại |
| 29 | Thấp | Số lượt dự kiến và số lượt bị trừ chưa khớp ở file nhỏ: | Đã sửa (bản 2153): dự kiến có phần cố định mỗi lần đọc (1 ảnh ≈ 2); đọc xong ghi "Đã dùng X · trả lại Y" |
| 30 | Cao | Thiếu lượt khi đang soạn bài thì mất bài, không quay lại được – Chi báo 30/10 (có quay màn hình): | Đã sửa (bản 2153): báo thiếu lượt ngay đầu, ô nhập mã ngay trên màn soạn, không trừ lượt bước tìm; tự lưu nháp + "Soạn tiếp"; menu tài khoản tự đóng, gọn 300 px |
| 31 | Cao | Bài tập tiếng Anh có câu không có đáp án duy nhất – Claude thử 30/10: | Đã sửa (bản 2153): code loại câu không có gợi ý duy nhất, câu sở thích, emoji sai màu, mức khá/nâng cao trùng mức cơ bản. Đã thử English 3 Unit 6 trên live |
| 32 | Vừa | Vai phụ huynh không thấy video khi soạn bài – Chi báo 30/10: | Đã sửa (bản 2153): phụ huynh có bước Video; ô tick ghi cả video |
| 33 | Thấp | Thông báo "Đã giao" chưa nổi bật – Chi báo 30/10: | Đã sửa (bản 2153): thẻ xanh "Đã giao cho …" + link + lộ trình |
| 34 | Vừa | Giao nhầm bài nhiều lần, không xoá được – Chi báo 30/10: | Đã sửa (bản 2153): Bỏ giao, cảnh báo giao lại, trạng thái Mới giao / Đang làm / Đã xong. Bản 2215: hộp xác nhận trong app, song ngữ, thay hộp của trình duyệt |
| 35 | Vừa | Lộ trình học: đổi số tuần bài 1 thì bài 2, 3 không tự dời ngày – Chi báo 30/10: | Đã sửa (bản 2153): ngày dời ngay, tự lưu, xếp theo trang sách. Ý bổ sung "Đã lưu" nổi bật: bản sau |
| 36 | Thấp | Dòng tiến trình "kept 3, the checker rejected 5" khó hiểu – Chi hỏi 30/10: | Đã sửa (bản 2225): "giữ 2 câu · loại 5 câu chưa đạt (đáp án sai, trùng), viết lại", theo ngôn ngữ; xem từng câu bị loại: chưa làm |
| 37 | Cao | Bài vừa soạn "biến mất" khi sang trang khác – Chi báo 30/10: | Đã sửa (bản 2215): thêm "Đang soạn…", mở lại đúng bước, dòng nhỏ khi rời bài chưa giao; ô ảnh thẻ ghi "Ví dụ" |
| 38 | Cao | Trang trống sau khi đăng ký – Chi báo 31/10: | Đã sửa (bản 2215): bài không có / của tài khoản khác → "Không tìm thấy… · Về Bài giảng"; đăng ký, đăng nhập luôn về Bài giảng. Đã thử trên live |
| 39 | Vừa | Kho trống mà bấm "Tạo bài giảng mới" thì bị kẹt – Chi chốt 31/10: | Đã sửa (bản 2215): lời dẫn + 3 nút; thêm sách mẫu một chạm, ở lại đúng bước. Đã thử trên live |
| 40 | Thấp | Đã chọn phần sách thì không cần thêm tài liệu – Chi chốt 31/10: | Đã sửa (bản 2215): mục 2 thu gọn "Tuỳ chọn · …", nút "Soạn bài từ phần này". Đã thử trên live |
| 41 | Vừa | Môn học: phụ huynh không có chỗ chọn, nhưng Thêm nguồn mặc định Toán; không thêm được môn khác – Chi báo 31/10: | Đã sửa (bản 2215): không chọn sẵn Toán; máy đoán môn và lớp từ tên tệp; "Hiện hỗ trợ Toán và Tiếng Anh lớp 1–5". Đã thử trên live |
| 42 | Cao | Nhắc người dùng dùng Chrome – Chi chốt 31/10: | Đã sửa (bản 2215): dải "chạy tốt nhất trên Chrome" + nút Tải Chrome trên trình duyệt khác; câu ở trang giới thiệu và ô tải; README |
| 43 | Vừa | "Carry on" mở nhầm bước – Chi chốt 31/10: | Đã sửa (bản 2215): mở đúng bước đang dừng; dải trên cùng chỉ việc gần nhất "Tiếp tục: … · <bước>"; nháp rỗng không lưu. Đã thử trên live |
| 44 | Vừa | Thêm trùng một file đã có trong Kho kiến thức, không cảnh báo – Chi báo 31/10: | Đã sửa (bản 1101.1113). Chi thử 1/11: Đạt (bản 1113) – hộp "Sách này đã có trong kho… Mở sách đã có thì không trừ lượt", Mở sách đã có về đúng sách |
| 45 | Vừa | Số trang app ghi lệch số trang in trên sách – Chi báo 31/10: | Đã sửa (bản 1101.1113): đọc số trang in khi đọc sách, Xem nguồn ghi kèm "trang N trong file", sách không đọc được số thì nhập trang 1 một lần. Phần sách scan tiếng Việt không làm tiếp (Sơn chốt 1/11 chỉ sách tiếng Anh); số trang chưa khớp ở sách tiếng Anh làm trong #53 |
| 46 | Cao | Tạo bài từ ảnh bài con đã làm: chưa thấy cá nhân hoá – Chi thử 31/10: | Đã sửa (bản 1101.1113, 1129, 1310). Chi thử 1/11 (bản 1129): Đạt phần lớn, xem dòng 54 |
| 47 | Cao | Bài soạn từ sách phạm vi 1000 nhưng bài tập toàn phạm vi 100 – Claude thấy 31/10: | Đã sửa (bản 1101.1113): phạm vi số theo phần sách (1000), loại câu quá nhỏ, có đặt tính rồi tính 3 chữ số |
| 48 | Cao | Sách Cánh Diều không được chia bài: 20 trang thành 1 phần – Claude thấy 31/10: | Không làm tiếp (sách tiếng Việt). Bổ sung (bản 1101.1310): sách đọc trước bản 1113 còn 1 phần có dải "Sách này chưa chia được bài…" + nút "Đọc lại để tách bài": sách scan đọc lại từ ảnh trang đã lưu (hiện dự kiến lượt trước, giữ lượt riêng, trả lại phần thừa), PDF có chữ đọc lại miễn phí; từ nay sách lưu chữ từng trang nên tách lại sau này miễn phí. Bài giảng đã soạn giữ nguyên. Sơn chốt 1/11 (chiều): không làm tiếp … |
| 49 | Cao | Dựng video tiếng Việt làm máy chủ sập (31/10, 22:50–23:02, bản 2215): | Không làm tiếp (sách tiếng Việt; video VI tắt). Chưa làm. **Bổ sung 1/11, 11:01–11:08:** soạn xong bài VI "Phép cộng (qua 10) trong phạm vi 20" (sách scan) lúc 10:59, không ai bấm Tạo video, nhưng máy chủ không trả lời 11:01–11:04, 502 lúc 11:06, 8–16 giây/yêu cầu đến 11:08; bước Video ghi "Chưa tạo được video" → dựng video VI tự chạy ngầm sau khi soạn và làm app sập. Con đang làm bài thì đứng im, tải lại ra trang … |
| 50 | Vừa | Gợi ý khi con sai còn chung chung; tư vấn chưa nhắc lỗi mới nhất (1/11): | Đã sửa (bản 1101.1310): lần sai thứ nhất vẫn là lời nhắc ngắn; lần sai thứ hai gợi cách làm trong bài, code tính từ chính các số (9 + 6: "Cộng qua 10: tách 6 = 1 + 5, 9 + 1 = 10, 10 + 5 = ?"; cộng/trừ có nhớ theo từng hàng; tìm số chưa biết…); lần thứ ba ra đủ phép tính. Thẻ tư vấn nhắc dạng lỗi lặp lại mới nhất trước; "Đang học" là bài vừa giao. Có một câu hỏi cho Chi (Trả lời, cập nhật 23). Chi thử 1/11 (bản … |
| 51 | Thấp | Lặt vặt 1/11: | Đã sửa (bản 1101.1424): (a) (b) (c) Chi thử Đạt (bản 1555); (d) đã sửa, chờ Chi thử lại; (e) bỏ (chỉ sách tiếng Anh). Ghi chú cũ: Sơn chốt 1/11 (chiều): chỉ sách tiếng Anh – bỏ (e) (mức giữ cho bài VI từ SGK); (a)–(d) vẫn làm sau cuộc thi. Bản 1101.1424: (a) vai phụ huynh ghi "… dạng bài con lặp lỗi" (bỏ "cả lớp"); (b) chỉ bài mới nhất là "Bài hôm nay", các bài khác "Bài khác: …"; (c) xoá nguồn thì danh sách cập … |
| 52 | Vừa | Tiếng Anh (1/11, bản 1113/1129): | Đã sửa (bản 1101.1310): câu nối từ–hình do code ghi đề "Match each word to its picture." / "Nối mỗi từ với hình đúng."; hình emoji dễ hiểu nhầm (💪 cho elbows) bị loại, bộ phận cơ thể không có emoji riêng không đưa vào câu nối; lời giải thích câu điền từ phải nói về đúng chỗ trống (gợi ý khi sai bám vào từ đó); nhãn lỗi theo ngôn ngữ giao diện; dạng đọc/viết số bằng chữ do code viết (321 → "three hundred and … |
| 53 | Thấp | Số trang (#45) chưa nhất quán và video không tự dựng (1/11): | Đã sửa phần video (bản 1101.1310): bước Video không còn ✓ khi chưa có video, ghi "đang tạo" / "chưa có" / "chỉ bài tiếng Anh"; nút "Tạo video (~3 phút)". Video tiếng Anh vẫn tự dựng ~3 phút sau khi soạn (2 bài EN của Chi sáng 1/11 đều đã có video). Phần số trang (#45) và "20 câu" để sau cuộc thi như Chi chốt. Sơn chốt 1/11 (chiều): chỉ sách tiếng Anh – phần số trang chỉ làm cho sách tiếng Anh, sau cuộc thi. Bản … |
| 54 | Vừa | #46 thử thật 1/11 (bản 1129): đạt phần lớn. | Đã sửa (bản 1101.1310): (a) câu có đơn vị ("329 cm + 183 cm") và bài toán có lời văn (máy đọc thêm phép tính cần làm, ví dụ "964 − 478") được code tính đáp án (512 cm, 486), đúng dạng; (b) câu dấu chấm và phép tính không khớp không tính là sai, không lên slide, thẻ ghi "… · 1 câu cần cô xem lại" đến khi bố mẹ tự chọn Đúng/Sai; (c) "Soạn bài từ lỗi này" chọn sẵn nguồn có phạm vi đủ lớn (phạm vi 1000 → sách 1000) và … |
| 55 | Vừa | Thử bản 1555 (1/11 chiều): | Đã sửa (bản 1101.1949): (a) câu tìm x ("273 + x = 321", "x − 218 = 609") code tính đáp án (48, 827), đúng dạng, không còn "cần xem lại"; (b) sách tiếng Anh: tiêu đề "1.4 Let's put on a play!" thành một phần riêng, phần không còn lấn sang bài sau (Sơn thử trên live: 1.3 / 1.4 / 1.5 ra 3 phần, trang in 6, 7, 8); (c) slide không còn ghi trang ngoài phần (lỗi do số trang bị đổi hai lần); (d) trang con đúng: bài có 20 … |
| 56 | Vừa | Xoá nguồn đang dùng trong bài: không xoá được nhưng không báo (Chi, 1/11 tối, bản 1555): | Đã sửa (bản 1101.1949): xoá nguồn đang dùng trong bài xoá được (bài đã soạn vẫn còn, con vẫn mở được bài đã giao); xoá không thể treo (xoá dữ liệu trước, tệp sau, có giới hạn thời gian); lỗi (nếu có) hiện ngay dưới tên nguồn; trang không bị khoá. Sơn chưa tái hiện được lỗi trên máy thử, nhờ Chi thử lại đúng nguồn đó. Chi thử 2/11: chưa thử lại (nguồn đó ở tài khoản Chi; Chi tự thử) |
| 57 | Cao | "Ảnh bài tập đã làm" ở bước Tài liệu không chọn con → bài soạn chung, không báo (Chi, 1/11 ~19:00, bản 1555): | Đã sửa phương án tối thiểu (bản 1101.1949): hai nút ghi rõ "Ảnh trang sách" / "Ảnh bài đã làm (đã chấm)"; chọn con trước khi đọc ảnh bài làm (1 con chọn sẵn, nhiều con phải chọn, "Không chọn" thì báo bài soạn chung); ảnh trang sách mà giống bài đã làm thì app hỏi chuyển và đọc lại. Ý gộp MỘT nút: chờ Chi chọn A/B/C (cập nhật 31). Bản 1101.2123: làm theo ý Chi (phương án B) – một nút "Chụp / tải ảnh"; tải xong app … |
| 58 | Cao | Giải thích từng nút chọn tài liệu (Chi chốt 1/11 tối, đi cùng #57). Mục đích: người dùng không lẫn lộn tính năng của hai nút "Ảnh bài giảng" và "Ảnh bài tập đã làm" (Chi đã nhầm và mất 88 lượt). | Đã sửa (bản 1101.1949): dấu ? cạnh 2 nút ảnh mở thẻ giải thích hai nút cạnh nhau, mỗi bên một hình minh hoạ, thẻ 2 nói bước sau khi tải bài làm; lần đầu bấm nút cũng hiện; ô "Không hiện lần sau" (nhớ trên trình duyệt theo tài khoản), bấm ? luôn mở lại. Cùng kiểu cho "Tự tìm hay chọn phần" và "Tải bài con đã làm" ở Con của tôi (hiện trước khi chọn ảnh). Sơn đã thử trên live (VI/EN). Chi thử 2/11 (bản 2307): Đạt – thẻ … |
| 59 | Thấp | Trang Bài giảng: bấm tiêu đề mục "Assigned" không thu gọn được (Chi, 1/11 20:56, bản 1949, tài khoản thử "tài khoản thử", video 10 giây): | Đã sửa (bản 1101.2246): Bản nháp / Đang giao / Đã xong mở và đóng độc lập; mục 0 bài ghi "Chưa có bài". Sơn đã thử. Chi thử 2/11 (bản 2307): Đạt – Assigned gập/mở được cả hai chiều |
| 60 | Cao | Bài soạn từ bài làm của con bao trùm cả phần sách, không thu về chỗ con sai (Chi, 1/11 tối, bản 1949): | Đã sửa (bản 1101.2246) theo cách Chi chốt: sau "Tìm trong nguồn", mọi loại tài liệu đều hỏi "Soạn bài theo phạm vi nào? ○ Chỉ theo tài liệu vừa đưa vào · tr. … (chọn sẵn) ○ Cả phần sách · tr. …"; lấy đúng các trang khớp, kể cả trong sách 1 phần; tài liệu thành trọng tâm bắt buộc ("cả bài chỉ về điều này"); bài từ bài làm của con cũng là phạm vi hẹp. Sơn đã thử trên live (chương tiếng Anh 3 trang: chỉ tr. 41–42, bài … |
| 61 | Cao | Giới hạn số slide và số câu bài tập mỗi bài (Chi chốt 1/11 tối): | Đã sửa (bản 1101.2246), Sơn chốt: bài từ cả phần tối đa 10 slide · 20 câu; bài từ tài liệu hẹp (một câu, ảnh, bài làm của con) tối đa 7 slide · 12 câu (câu từ bài con làm giữ trước); thẻ nhớ tối đa 8; dòng cuối tiến trình và bước Giao bài ghi đúng số câu. Chi thử 2/11 (bản 2307): bài "One sentence" (không được hỏi phạm vi) ra 10 slide · 21 câu (3 nối + 11 điền + 3 sắp xếp + 4 tìm cặp) + 8 thẻ nhớ – vượt mức 20 câu … |
| 62 | Vừa | Thêm phần góp ý từ người dùng (Chi chốt 1/11 tối): | Đã sửa (bản 1101.2246): nút "Góp ý" góc dưới phải (không có ở trang của con): loại góp ý, ô viết, ảnh chụp màn hình tuỳ chọn, tự ghi trang và phiên bản; "Bài này dùng được không?" có nút thích / không thích (một lần mỗi bài); "Báo câu này" ở từng câu bài tập; góp ý lưu ở trang admin và gửi email về (email) (Sơn đã nhận được email thử). Chi thử 2/11 (bản 2307): Đạt – nút Feedback góc dưới phải (Bug / Hard to use / … |
| 63 | Cao | Thử lại bản 2307 (Chi, 2/11 sáng, tài khoản thử "tài khoản thử", giao diện EN) – đạt: #57, #58, #59, #62, 55b, 55d. Còn 3 điểm: | Đã sửa, bản 0935 và 1116: (a) luôn hỏi trang, giờ người dùng tự chọn phần (chọn nhiều được) và tự tick trang, không còn "Tự tìm"; bài "21 câu" của Chi thật ra 17 câu (trong mức 20); (b) đơn vị sau chỗ trống ("= ___ cm") đọc đúng; (c) đổi loại tài liệu thì xoá ảnh và lỗi cũ. Chi thử 2/11 trưa (bản 1144): (a) Đạt theo cách mới (tự chọn phần, tick trang, mức 7 slide · 12 câu ghi rõ; bài từ 2 kỹ năng ra 7 slide · 8 câu … |
| 64 | Vừa | Dải "Chỗ con hay sai / Mistakes seen" của ảnh trước vẫn còn khi đổi loại tài liệu (Chi, 2/11, bản 2307 – tách từ dòng 63c, Chi chốt sửa): | Đã sửa, bản 0935: đổi loại tài liệu thì xoá dải "Mistakes seen", bảng lỗi, lời đoán và ảnh cũ. Chi thử 2/11: chưa thử lại (cần tải ảnh, hết lượt thử) |
| 65 | Vừa | Thẻ nhớ: bấm "Chưa thuộc / Again" thì thẻ quay lại mãi, số đếm không nhích, con không biết làm sao để xong (Chi, 2/11 sáng, bản 0935, link của con, bài "Adding with regrouping within 100"): | Đã sửa, lên live bản 1102.1144: bấm Again thì hiện "Thẻ này sẽ quay lại sau"; số đếm là "đã xong x/8 thẻ"; thẻ bấm Again lần 2 được để sang "cần ôn" nên vòng luôn kết thúc; màn cuối ghi các thẻ cần ôn; trang con ghi "8 thẻ · xong · 1 thẻ cần ôn". Chi thử 2/11 (bản 1144): Đạt – "This card will come back later.", "x/8 cards done", màn cuối "Cards to go over again: Dragon Dance", trang con "8 cards · done · 1 to go … |
| 66 | Vừa | "Tìm cặp / Find the pairs" làm xong không ghi "done" (Chi báo 2/11 sáng, bản 0935, link của con, bài "Adding with regrouping within 100"; Claude thử lại): | Đã sửa, lên live bản 1102.1144: tìm đủ cặp thì lưu "xong", ô ghi "Find 4 pairs · done", thanh tiến trình có thêm đoạn thứ tư cho trò tìm cặp. Chi thử 2/11 (bản 1144): Đạt – "Find 4 pairs · done", thanh 4 đoạn |
| 67 | Vừa | Cùng một bài giao 2 lần cho một con: màn của con và trang Con của tôi hiện 2 bài trùng tên, người dùng không phân biệt được (Chi, 2/11 sáng, bản 0935, con): | Đã sửa, lên live bản 1102.1144: hỏi trước khi giao lại đã có từ trước; nay mỗi dòng bài đã giao ghi "Giao ngày 02/11, 11:33 · Unit 6: Colours, tr. 3", và trên màn của con hai bài trùng tên ghi ngày giờ giao. Chi thử 2/11 (bản 1144): Đạt phần danh sách – "Given 02/11, 11:23 · 1.1 Celebrating together, p. 1–2"; hỏi trước khi giao lại chưa thử lại |
| 68 | Thấp | Bài đã "Done" vẫn có nút "Unassign" (Chi, 2/11 sáng, bản 0935, Con của tôi → Assigned lessons): | Đã sửa, lên live bản 1102.1144: bài Done có "Ẩn khỏi danh sách" (giữ kết quả trong Tóm tắt, con vẫn thấy bài) thay cho Bỏ giao; bỏ giao bài đã có người làm thì hỏi rõ "đã làm x/y, bỏ giao thì…". Chi thử 2/11 (bản 1144): Đạt – bài Done có "Hide from the list", hết Unassign (chưa bấm thử Hide) |
| 69 | Vừa | Bài con đã làm xong vẫn nằm ở mục "Assigned", mục "Done" ghi 0 (Chi, 2/11 sáng, bản 0935, tài khoản thử): | Đã sửa, lên live bản 1102.1144: khi mọi con được giao đã làm xong (đếm theo con, không theo bản giao) thì bài chuyển sang Done ngay, kể cả chưa tới hạn; thẻ bài ghi "Nam · 1/1 finished". "Xong" nghĩa là làm hết câu luyện tập. Chi thử 2/11 (bản 1144): Đạt – Assigned 0, Done 3, thẻ "con · 1/1 finished" |
| 70 | Cao | Câu sắp xếp từ: xếp thiếu một chữ thì nút "Check" mờ, không báo gì, người dùng tưởng app treo (Chi, 2/11 sáng, bản 0935, link của con, bài "Let's play together", câu "You must pick up the blue paper."): | Đã sửa, lên live bản 1102.1144: chữ đã dùng mờ đi ở hàng dưới; chạm chữ ở hàng trên để bỏ xuống; Check luôn bấm được, thiếu chữ thì báo "Còn chữ chưa dùng: blue"; dòng nhỏ ghi theo dạng câu (Put the words in order / Match the pairs / True or false? / Type the answer); lời giải câu sắp xếp: đã dặn AI giải theo thứ tự câu, không viết "This is a rule for…" (bài soạn mới). Chi thử 2/11 (bản 1144, bài mới (bài)): … |
| 71 | Cao | Câu nối từ–hình lộ đáp án, quá dễ (Chi, 2/11 sáng, bản 0935, link của con, bài "Let's play together", câu 2/5 "Match each word to its picture."): | Đã sửa, lên live bản 1102.1144: vế trái chỉ còn chữ (bỏ hình dính kèm, cả với bài đã giao trước đây), hai cột luôn khác thứ tự; câu cũ vẫn chấm đúng. Phần (3) hình minh hoạ khác cho từ chỉ hướng: chưa làm, vì đã hết lộ đáp án. Chi thử 2/11 (bản 1144): Đạt – cột trái chỉ chữ (red / blue / yellow), cột phải 🔵 🟡 🔴 khác thứ tự; nhãn "Match the pairs". Nhưng câu này gắn kỹ năng "Spelling -ing verbs" trong khi nội dung là … |
| 72 | Vừa | Bản đồ kỹ năng: "Ask the app" trả đề xuất nhưng không có nút Apply / Dismiss (Chi, 2/11 trưa, bản 1144, tài khoản thử, sách "Test English - Unit 1"): | Đã sửa, lên live bản 1102.1659: đề xuất thiếu mã kỹ năng thì gắn vào kỹ năng đang chọn (hoặc tìm theo tên), nên có Apply/Dismiss; không có gì để đổi thì câu trả lời ghi rõ "Nothing was changed / Mình chưa đổi gì". Bản 1738 sửa thêm: đề xuất đổi tên mà AI không ghi tên mới thì lấy tên trong ngoặc kép của câu trả lời, không có tên thì bỏ (trước đó Apply không đổi gì). |
| 73 | Thấp | Thêm mục "Skills map Beta" làm menu trên cùng xuống 2 dòng (Chi, 2/11 trưa, bản 1144, cửa sổ 1408 px, trang Skills map): | Đã sửa, lên live bản 1102.1659: mục menu đổi thành "Skills" (vi: "Kỹ năng") + nhãn Beta, gọn một hàng. Bản 1738 sửa thêm: khi hiện nhãn "Working on" menu vẫn một hàng. |
| 74 | Vừa | Bài soạn từ kỹ năng: câu gần trùng nhau và câu gắn sai kỹ năng (Chi, 2/11 trưa, bản 1144, bài "1.2 Let's play together & 1.3 Team fun" soạn từ 2 kỹ năng, 8 câu): | Đã sửa, lên live bản 1102.1659: (a) code coi câu cùng đề và cùng đáp án là trùng ở mọi mức, mọi kỹ năng, câu sau bị viết lại; (b) dặn AI mỗi câu phải luyện đúng kỹ năng của nó bằng từ của kỹ năng đó (không đưa câu màu sắc vào kỹ năng -ing) – phần (b) là dặn AI và vòng rà soát, chưa có kiểm tra cứng bằng code vì dễ loại nhầm câu đúng |
| 75 | Vừa | Bản đồ kỹ năng: đường màu vàng không có chú giải, người dùng không hiểu (Chi hỏi 2/11 chiều, bản 1144): | Đã sửa, lên live bản 1102.1659, cách nhẹ: một dòng chú giải nhỏ dưới Map/List (chấm xanh = kỹ năng tiếng Anh, chấm cam = kỹ năng toán – đây là nghĩa của viền vàng/cam, đường cong cam = cần học trước); rê chuột lên đường cam hiện "A → cần trước → B"; tên trong "Builds on / Leads to" bấm được để nhảy tới kỹ năng đó |
| 76 | Vừa | Màn của con liệt kê quá nhiều "Another lesson", kể cả bài đã làm xong (Chi, 2/11 chiều, bản 1144, link của con): | Đã sửa, lên live bản 1102.1659 đúng như Chi chốt: một "Bài hôm nay" (bài mới nhất chưa xong) đủ các ô; mục gập "Bài đã giao (n)" và "Bài đã xong (n)", mỗi bài một dòng (tên · x/y bước · giao ngày …), bấm vào mở các ô; bài bị "Ẩn khỏi danh sách" cũng ẩn trên màn con; bỏ chuỗi "Another lesson" |
| 77 | Cao | Câu điền từ vô nghĩa, đáp án nằm ngay trong đề (Chi, 2/11 chiều, bản 1144, bài "Animals" soạn từ sách mẫu English 3, link của con, câu 1/5): | Đã sửa, lên live bản 1102.1659: code loại câu điền từ có từ đáp án (kể cả số nhiều/-ing) trong đề, AI phải viết lại với manh mối (mô tả, câu hỏi); dặn AI câu từ vựng dùng manh mối. Bài đã soạn trước đây không đổi |
| 78 | Cao | Giao được bài khi video còn "being made" (Chi hỏi 2/11 chiều, bản 1144; Claude cũng gặp với bài (bài)): | Đã sửa, lên live bản 1102.1659 theo cách (1): video đang dựng thì ô tick ghi "…slides and exercises (the video is still being made)", giao xong báo video tự hiện cho con; chưa có video thì không nhắc video; màn con: ô video mờ, ghi "Video coming soon" |
| 79 | Vừa | Xem slide khó: không có nút chuyển slide, và con không thấy slide (Chi hỏi 2/11 chiều, bản 1144): | Đã sửa, lên live bản 1102.1659: (a) bước Slides có nút ◀ Previous / Next ▶, phím ←/→, danh sách tự cuộn theo; (b) ô "Look at the lesson / Xem bài" cho con ở mọi bài (trước Video): từng trang, nút Trước/Sau to, nút "Read it / Đọc" đọc bằng giọng của video (máy tự đọc khi giọng máy chủ tắt), tính vào tiến trình |
| 80 | Vừa | Cùng một file sách đọc hai lần ra hai cách chia phần khác nhau; hai nguồn trùng tên nằm cạnh nhau (Chi, 2/11 chiều, bản 1144, tài khoản thử): | Để sau 5/11 (Chi đã chốt danh sách cuối là #72–#79). Ghi nhận: chia phần bằng code theo tiêu đề đánh số cho kết quả ổn định, và phân biệt hai nguồn trùng tên |
| 81 | Vừa | Cần hướng dẫn cách chấm bài để app đọc đúng dấu đúng/sai (Chi chốt 3/11 chiều, bản 1917, phiếu "Let's play together" 13 câu, con làm thật): | Chưa làm |
| 82 | Thấp | Không xoá được bài đã soạn (nháp hoặc đang soạn) (Chi hỏi 3/11 chiều, bản 1917): | Chưa làm |
| 83 | Cao | Bài "Made for (tên con)" không bám lỗi của con khi phần sách chọn không khớp phiếu (Chi quay màn hình 3/11 18:13, bản 1917, tài khoản thử): | Chưa làm |
| 84 | Vừa | Trang của con tự chuyển "Today" sang bài khác sau khi làm xong (Chi quay màn hình 3/11 tối, bản 1917, con làm thật): | Chưa làm |
| 85 | Thấp | "Practise · 16 questions" trên trang của con nhưng một lượt chỉ có 5 câu ("Question 1/5"): | Chưa làm |
| 86 | Thấp | Thẻ nhớ "5 + 4 + 2" (mặt sau 🎉) trong bài "Let's play together" (video Chi quay 3/11, phút 1:40): | Chưa làm |
| 87 | Thấp | Bản nháp giữ lại sau khi tải ảnh phiếu rồi bỏ dở (3/11, bản 1917): | Chưa làm |
| 88 | — | Ghi nhận tốt (bổ sung dòng 83): | Đã thử |

## Timeline of replies (Son → Chi)

- Đã sửa (đã deploy, 29/10)
- Đang sửa
- Chờ quyết định
- Cập nhật 29/10 (lần 2): đã deploy
- Cập nhật 29/10 (lần 3): đã deploy (9de896a)
- Trả lời các mục mới (#1 chốt mức credit, #14, #15)
- Cập nhật 29/10 (lần 4): đã deploy
- Cập nhật 29/10 (lần 5): #1 Sơn đã chốt mức credit
- Cập nhật 29/10 (lần 6): #6 và #10 đã sửa, đã deploy
- Cập nhật 29/10 (lần 7): đọc sách lớn, sách scan và hàng đợi đã làm xong, đã deploy
- Cập nhật lần 8 (29/10, tối): trang Lượt dùng, và kiểm lại lượt dùng
- Trang quản trị (admin) và trang Lượt dùng khác nhau thế nào
- Cập nhật lần 9 (29/10, khuya): #16, #17, #18
- Cập nhật lần 10 (29/10, khuya): #19, mã cho người dùng thử
- Cập nhật lần 11 (30/10): #20–#24, xem nguồn, bản đồ kiến thức, lưu tệp gốc
- Cập nhật lần 12 (30/10, trưa): tất cả cập nhật 11 đã lên live
- Cập nhật lần 13 (30/10, tối): chia phạm vi cho SGK scan
- Cập nhật lần 14 (30/10, khuya): trả lời kết quả thử bản 2120/2153 và Ghi chú của Chi
- Cập nhật lần 15 (30/10, khuya): mã (mã) lên 300 lượt
- Cập nhật lần 16 (31/10): trả lời kết quả thử sáng 31/10, 2 câu trả lời của Chi và #38–#41
- Cập nhật lần 17 (31/10, chiều): Safari (#26), #42, #43
- Cập nhật lần 18 (31/10, tối): bản v1.0.20261031.2215 đã lên live
- Cập nhật lần 19 (31/10, tối): #44–#48 đang sửa
- Cập nhật lần 20 (31/10, tối): #46 làm đúng cấu trúc Chi chốt
- Cập nhật lần 21 (1/11, trưa): #44–#48 đã lên live; tìm ra nguyên nhân #49
- Cập nhật lần 22 (1/11, chiều): #49 – Sơn chốt video chỉ làm cho bài tiếng Anh, nhờ Chi xác nhận
- Cập nhật lần 23 (1/11, chiều): 5 việc ưu tiên của Chi đã lên live (bản v1.0.20261101.1310)
- Cập nhật lần 24 (1/11, chiều): Sơn thử bản 1310 trên live, sửa thêm 2 chỗ (bản v1.0.20261101.1328)
- Cập nhật lần 25 (1/11, chiều): Sơn chốt chỉ làm sách tiếng Anh
- Cập nhật lần 26 (1/11, chiều): các việc Sơn đang giữ – nhờ Chi quyết định
- Cập nhật lần 27 (1/11, chiều): Sơn làm luôn tất cả việc đang giữ (trừ sách tiếng Việt)
- Cập nhật lần 28 (1/11, chiều): đã làm hết việc còn lại (bản v1.0.20261101.1424)
- Cập nhật lần 29 (1/11, chiều): bản v1.0.20261101.1440
- Cập nhật lần 30 (1/11, chiều): Sơn thử trên live các mục còn lại, sửa thêm 3 lỗi (bản v1.0.20261101.1555)
- Cập nhật lần 31 (1/11, tối): #57 một nút ảnh – nhờ Chi chọn
- Cập nhật lần 32 (1/11, tối): #55–#58 đã lên live (bản v1.0.20261101.1949)
- Cập nhật lần 33 (1/11, tối): #57 một nút ảnh đã lên live (bản v1.0.20261101.2123)
- Cập nhật lần 34 (1/11, tối): #59–#62 đã lên live (bản v1.0.20261101.2246) + tài liệu thử cuối
- Cập nhật lần 35 (1/11, khuya): 3 lỗi nhỏ tiếng Anh đã lên live (bản v1.0.20261101.2307)
- Cập nhật lần 36 (2/11, trưa): Bản đồ kỹ năng (Beta) và cách chọn phạm vi mới, lên live bản v1.0.20261102.1116
- Cập nhật lần 37 (2/11, chiều): #65–#71 đã sửa, chờ lên live
- Cập nhật lần 38 (2/11, chiều): những gì chưa làm
- Cập nhật lần 39 (2/11, chiều): nhờ Chi xác nhận
- Chi gửi Sơn – 2/11 chiều (sau khi thử bản 1144)
- Cập nhật lần 40 (2/11, tối): hồ sơ nộp bài gửi qua email
- Cập nhật lần 41 (2/11, tối): #72–#79 đã sửa, chờ lên live
- Cập nhật lần 42 (2/11, tối): #72–#79 đã lên live (bản 1659, sửa thêm ở 1738)
- Cập nhật lần 43 (2/11, tối): cảm ơn Chi đã thử bản 1738; sửa #73 và ý nhỏ ở #78 (chờ lên live)
- Cập nhật lần 44 (2/11, tối): #73 và #78 lên live bản 1917
- Cập nhật lần 45 (2/11, tối): mọi mục Chi nhờ đã có trên live (bản 1917)
- Cập nhật lần 46 (3/11, trưa): đã nhận bản mô tả của Chi; repo công khai đã chuẩn bị (chưa công khai)
