// The demo notice (Meta hackathon). While LessonBloom runs on Meta's free hackathon credits, Meta may
// use what is sent to its models to improve its products, so nobody should upload personal data.
import { useT } from '../i18n.ts';

const T = {
  vi: { short: 'Bản demo cho cuộc thi Meta. Nội dung gửi tới AI của Meta có thể được Meta dùng để cải thiện sản phẩm. Không tải lên thông tin cá nhân, ảnh có người hay tài liệu bí mật.' },
  en: { short: "Demo for the Meta hackathon. What is sent to Meta's AI may be used by Meta to improve its products. Do not upload personal information, photos of people or confidential documents." },
};

export function Notice({ compact = false }: { compact?: boolean }) {
  const t = useT(T);
  return <p className={compact ? 'notice small' : 'notice'} role="note">ⓘ {t.short}</p>;
}
