// Error answers: every message in Vietnamese and English; the browser shows the teacher's language.
import type { Context } from 'hono';

export const MSG = {
  signIn: { vi: 'Cô đăng nhập hoặc bấm "Dùng thử" nhé.', en: 'Please sign in or start the demo.' },
  email: { vi: 'Địa chỉ email chưa đúng.', en: 'That email address does not look right.' },
  tooSoon: { vi: 'Cô đợi một phút rồi xin mã mới nhé.', en: 'Please wait a minute before asking for a new code.' },
  tooMany: { vi: 'Hôm nay đã xin quá nhiều mã. Cô thử lại vào ngày mai nhé.', en: 'Too many codes today. Please try again tomorrow.' },
  mailFailed: { vi: 'Chưa gửi được email. Cô thử lại sau ít phút nhé.', en: 'The email could not be sent. Please try again in a few minutes.' },
  codeWrong: { vi: 'Mã chưa đúng. Cô kiểm tra lại email nhé.', en: 'That code is not right. Please check the email.' },
  codeExpired: { vi: 'Mã đã hết hạn. Cô xin mã mới nhé.', en: 'That code has expired. Please ask for a new one.' },
  demoLimit: { vi: 'Hôm nay mạng này đã tạo nhiều bản dùng thử. Cô đăng nhập bằng email nhé.', en: 'Too many demos from this network today. Please sign in with your email.' },
  bad: { vi: 'Yêu cầu chưa hợp lệ.', en: 'Invalid request.' },
  notFound: { vi: 'Không tìm thấy mục này.', en: 'Not found.' },
  notesShort: { vi: 'Cô nhập nội dung bài học (ít nhất vài câu) nhé.', en: 'Please enter the lesson notes (at least a few sentences).' },
  notesLong: { vi: 'Ghi chú quá dài. Cô rút gọn còn dưới 20.000 ký tự nhé.', en: 'The notes are too long. Please keep them under 20,000 characters.' },
  notLesson: { vi: 'Nội dung này chưa giống ghi chú bài học. Cô thử lại với tên bài, kiến thức, ví dụ, bài tập nhé.', en: 'This does not look like lesson notes yet. Try the topic, what pupils learn, examples and exercises.' },
  photos: { vi: 'Ảnh chưa đọc được: tối đa 5 ảnh JPG, PNG hoặc WEBP, mỗi ảnh dưới 4 MB.', en: 'Photos could not be read: up to 5 JPG, PNG or WEBP photos, under 4 MB each.' },
  voice: { vi: 'Bản ghi âm chưa dùng được: tối đa 5 phút.', en: 'The recording could not be used: up to 5 minutes.' },
  setup: { vi: 'Cô kiểm tra lại môn, lớp và tên bài nhé.', en: 'Please check the subject, grade and title.' },
  lessonLimit: { vi: 'Hôm nay cô đã soạn đủ số bài cho phép. Cô quay lại vào ngày mai nhé.', en: 'You have made today\'s lessons. Please come back tomorrow.' },
  budget: { vi: 'Hôm nay LessonBloom đã dùng hết hạn mức AI. Cô thử lại vào ngày mai nhé.', en: 'LessonBloom has used today\'s AI allowance. Please try again tomorrow.' },
  aiBlocked: { vi: 'LessonBloom chỉ soạn bài giảng và bài luyện tập từ ghi chú bài học. Cô kiểm tra lại nội dung nhé.', en: 'LessonBloom only makes lessons and practice from lesson notes. Please check the text.' },
  aiBusy: { vi: 'AI đang bận, cô thử lại sau ít phút nhé.', en: 'The AI is busy. Please try again in a few minutes.' },
  cutoutName: { vi: 'Cô gõ tên đồ vật cần cắt, ngắn gọn (ví dụ: quả táo, đồng xu, chậu cây).', en: 'Type the name of the thing to cut out, briefly (for example: apples, coins, plant pot).' },
  cutoutPeople: { vi: 'Không cắt người hoặc khuôn mặt: ảnh của các con không đưa vào bài. Cô chọn đồ vật nhé.', en: 'People and faces are not cut out: children\'s photos never go into lessons. Please choose an object.' },
  cutoutNone: { vi: 'AI chưa tìm thấy đồ vật này trong ảnh. Cô thử tên khác hoặc ảnh rõ hơn nhé.', en: 'The AI could not find that in the photo. Try another name or a clearer photo.' },
  pictureFailed: { vi: 'Chưa vẽ được hình phù hợp. Cô thử lại nhé.', en: 'No suitable picture this time. Please try again.' },
  server: { vi: 'Có lỗi ở máy chủ. Cô thử lại sau nhé.', en: 'Something went wrong on the server. Please try again.' },
} as const;
export type MsgKey = keyof typeof MSG;
export const fail = (c: Context, key: MsgKey, status: 400 | 401 | 403 | 404 | 409 | 413 | 429 | 500 | 503 = 400) =>
  c.json({ code: key, error: MSG[key].vi, errorEn: MSG[key].en }, status);
