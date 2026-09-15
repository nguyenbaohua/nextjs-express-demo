/*
 * ============================================================================
 * SCHEMA VALIDATE (ZOD) — trạm kiểm soát ở cửa vào của backend
 * ============================================================================
 *
 * ---------------------------------------------------------------------------
 * VÌ SAO PHẢI VALIDATE, TRONG KHI ĐÃ CÓ TYPESCRIPT?
 * ---------------------------------------------------------------------------
 * Đây là hiểu lầm phổ biến nhất của người mới. Hãy nhớ một câu:
 *
 *     TypeScript chỉ tồn tại LÚC BẠN VIẾT CODE. Lúc chạy thật, nó BIẾN MẤT.
 *
 * Khi biên dịch sang JavaScript, mọi khai báo kiểu bị xoá sạch. Nghĩa là nếu
 * bạn viết:
 *
 *     const content = req.body.content as string;   // ← lời hứa suông
 *
 * thì lúc chạy, `content` có thể là số 42, là `null`, là một mảng, hoặc không
 * tồn tại — TypeScript không hề kiểm tra giúp bạn, vì nó không còn ở đó nữa.
 *
 * Lý do sâu xa hơn: dữ liệu tới từ BÊN NGOÀI. Người dùng có thể mở terminal và
 * gõ `curl -X POST ... -d '{"content": 12345}'`, hoặc gửi luôn body rỗng. Frontend
 * của bạn có kiểm tra kỹ đến đâu cũng vô nghĩa, vì kẻ gửi request không bắt buộc
 * phải dùng frontend của bạn.
 *
 * Zod lấp đúng khoảng trống đó: nó kiểm tra THẬT lúc chạy, và đồng thời cho
 * TypeScript biết kiểu dữ liệu sau khi kiểm tra. Một lần khai báo, hai lợi ích.
 *
 * ---------------------------------------------------------------------------
 * `parse` HOẠT ĐỘNG THẾ NÀO?
 * ---------------------------------------------------------------------------
 *     const { id } = todoIdParamSchema.parse(req.params);
 *
 *   - Dữ liệu HỢP LỆ  → trả về object mới, đã được làm sạch và ép đúng kiểu.
 *   - Dữ liệu SAI     → NÉM ra `ZodError` ngay lập tức. Các dòng code phía sau
 *                       không chạy. `catch` trong controller bắt lấy và chuyển
 *                       tới `errorHandler`, nơi biến nó thành phản hồi 400 kèm
 *                       danh sách lỗi chi tiết cho từng trường.
 *
 * (Zod còn có `safeParse` trả về `{ success, data | error }` thay vì ném lỗi.
 * Dự án này chọn `parse` vì đã có sẵn hệ thống xử lý lỗi tập trung — ném lỗi ra
 * cho `errorHandler` lo là cách viết ngắn gọn nhất.)
 *
 * ---------------------------------------------------------------------------
 * NGUYÊN TẮC: VALIDATE Ở BIÊN
 * ---------------------------------------------------------------------------
 * Chỉ kiểm tra đúng MỘT LẦN, ngay tại cửa vào (controller). Từ sau ranh giới đó,
 * mọi tầng bên trong được phép tin tưởng tuyệt đối vào dữ liệu và không cần
 * kiểm tra lại. Nhờ vậy tầng service mới sạch sẽ như bạn thấy — không có dòng
 * `if (!content) ...` nào cả.
 */

import { z } from "zod";

/**
 * Kiểm tra body của `POST /api/todos`.
 *
 * Đọc từng mắt xích, mỗi mắt xích là một luật:
 *
 *   z.object({...})  Dữ liệu phải là một object có trường `content`.
 *                    Mặc định Zod BỎ QUA các trường thừa: gửi kèm
 *                    `{"content":"x","isDone":true}` thì `isDone` bị loại bỏ,
 *                    không lọt xuống database. Đây là cơ chế bảo vệ quan trọng —
 *                    ngăn kẻ xấu tự ý set những trường mà API không cho phép
 *                    (lỗ hổng này có tên riêng: "mass assignment").
 *
 *   .string()        Phải là chuỗi. Số 42 hay `null` đều bị từ chối.
 *
 *   .trim()          Đây là mắt xích BIẾN ĐỔI, không phải kiểm tra: nó cắt bỏ
 *                    khoảng trắng thừa hai đầu. Vì `parse` trả về dữ liệu SAU
 *                    biến đổi, cái được lưu vào database là chuỗi đã cắt gọn.
 *
 *   .min(1, "...")   Sau khi cắt phải còn ít nhất 1 ký tự. Thứ tự rất quan
 *                    trọng: `.trim()` chạy TRƯỚC nên chuỗi toàn dấu cách `"   "`
 *                    sẽ thành `""` và bị chặn ở đây. Nếu đảo ngược thứ tự thì
 *                    `"   "` (3 ký tự) lại lọt qua.
 *
 *                    Tham số thứ hai là thông báo lỗi tuỳ chỉnh. Viết bằng tiếng
 *                    Việt vì nó được gửi thẳng tới người dùng cuối: `errorHandler`
 *                    gom các thông báo này vào phản hồi 400, và frontend hiển
 *                    thị lại nguyên văn dưới ô nhập liệu.
 */
export const createTodoSchema = z.object({
  content: z.string().trim().min(1, "content không được để trống"),
});

/**
 * Kiểm tra body của `PUT /api/todos/:id`.
 *
 * Hiện giống hệt `createTodoSchema`. Có nên gộp làm một cho gọn không?
 *
 * Không nên, và đây là một quyết định thiết kế có chủ đích. Hai schema mô tả hai
 * TÌNH HUỐNG khác nhau, dù hôm nay luật của chúng trùng nhau. Ngày mai khi "tạo
 * mới" cần thêm trường `dueDate` mà "sửa nội dung" thì không, bạn chỉ việc sửa
 * một schema. Nếu đã gộp, bạn sẽ phải tách ra — mà tách thì rủi ro hơn nhiều so
 * với việc chấp nhận hai dòng trông giống nhau.
 *
 * Bài học chung: code giống nhau chưa chắc là lặp lại. Chỉ gộp khi hai thứ thay
 * đổi CÙNG LÝ DO.
 */
export const updateTodoContentSchema = z.object({
  content: z.string().trim().min(1, "content không được để trống"),
});

/**
 * Kiểm tra `req.params` — phần `:id` trong URL.
 *
 * `z.coerce.number()` là mắt xích quan trọng nhất file này. Nhớ lại: mọi thứ
 * lấy từ URL đều là CHUỖI, vì URL vốn chỉ là văn bản. `GET /api/todos/7` cho
 * `req.params.id === "7"`, không phải `7`.
 *
 * `coerce` (ép kiểu) bảo Zod: hãy thử `Number(giá_trị)` trước khi kiểm tra.
 *
 *     "7"     → 7    ✓
 *     "abc"   → NaN  ✗ bị `.number()` chặn
 *     "1.5"   → 1.5  ✗ bị `.int()` chặn
 *     "-3"    → -3   ✗ bị `.positive()` chặn
 *     "0"     → 0    ✗ bị `.positive()` chặn (id trong Postgres bắt đầu từ 1)
 *
 * Vì sao phải chặn kỹ đến vậy, sao không cứ đưa xuống Prisma cho nó tự báo lỗi?
 * Hai lý do:
 *   1. Prisma sẽ ném một lỗi kỹ thuật khó hiểu, và `errorHandler` sẽ coi đó là
 *      lỗi lạ → trả về 500 "Lỗi hệ thống". Nhưng đây là lỗi của người GỬI, phải
 *      là 400 mới đúng. Sai mã status khiến việc giám sát hệ thống trở nên vô ích
 *      (bạn sẽ thấy hàng đống 500 giả trong log).
 *   2. Chặn sớm thì tiết kiệm: không phải chạm tới database chỉ để nhận về một
 *      câu "id không hợp lệ".
 *
 * Cả ba schema đều được `export` để controller import. Chúng chỉ là dữ liệu mô
 * tả luật, có thể tái sử dụng ở bất cứ đâu — kể cả để sinh tài liệu API tự động.
 */
export const todoIdParamSchema = z.object({
  id: z.coerce.number().int().positive("id không hợp lệ"),
});
