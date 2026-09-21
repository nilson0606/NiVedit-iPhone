# NiVedit iPhone 0.2.1 修正與交接

## 本次範圍

修正使用者回報的預覽閃爍、影片原音沒有聲音；依使用者要求，移除自動草稿，改用既有的新建、開啟、儲存、另存副本。
本機與獨立 GitHub Pages 同步發布：https://nilson0606.github.io/NiVedit-iPhone/ 。
桌面 V13 與重要還原點未修改。

## 預覽

舊預覽在每次重畫時先清黑，媒體仍在 seeking 時略過影片，會插入黑畫面。舊版還依賴隱藏的 HTML 媒體播放與非同步音訊解鎖；實際 iPhone 無聲的完整成因尚未由真機診斷確認。

新版 src/media.js 使用 Mediabunny CanvasSink 逐幀解碼，在背後畫布組合完成所有圖層後才更新可見畫布。解碼等待時保留上一張完整畫面；暫停、跳轉和切換專案會取消過期工作。播放繪製上限為每秒 30 幀，每個影片保留目前與下一幀。

src/preview-audio.js 使用 AudioBufferSink 解碼，以 0.75 秒預先排程原音，不把整支影片解成常駐音訊。所有影片以同一個 AudioContext 時鐘同步，遵守裁剪起點、時間軸位置、音量及靜音；暫停會停止排程音源。點播放時，在使用者手勢內立即呼叫 resume；如支援 Audio Session API，設定 playback 類型。診斷資訊保留播放後端、context 狀態和排程狀態。

參照桌面 src/40_ui.js、30_render.js、50_export.js 的素材時間、圖層與原音混音規則。行動版使用不同的解碼與播放實作，並非直接複製桌面 HTML 媒體播放方式。
API 依專案內 Mediabunny 1.58.1 原碼核對；相關原始說明：
- [Mediabunny media sinks](https://mediabunny.dev/guide/media-sinks)
- [WebKit iOS video policies](https://webkit.org/blog/6784/new-video-policies-for-ios/)
- [Audio Session 規格](https://www.w3.org/TR/audio-session/)

## 專案儲存

- 移除草稿按鈕、還原草稿提示及編輯後自動寫入。
- 下方提供「儲存專案」；修改後標示「有未儲存變更」。
- 專案選單仍有新建、開啟、儲存、另存副本、可攜 .nvproj 備份。
- 換專案前仍提示未儲存修改；更新工具會先嘗試儲存，失敗便不繼續更新。
- 升級一次性把舊草稿複製為「先前草稿復原副本」命名專案。交易與遷移標記避免重複，原草稿資料保留，不覆蓋既有專案。
- 保留 storage.js 舊 draft API 供歷史升級測試；目前 app 不使用它寫入草稿。
- 瀏覽器儲存與外部 .nvproj 備份不同，手冊已說明需完成下載或分享。

## 驗證與限制

Windows Edge 的行動尺寸自動化，不等同實際 iPhone 驗收：
- preview-playback.cjs：8 項；封鎖 HTMLMediaElement.play、要求使用者手勢、量測實際 Web Audio 輸出圖。雙軌原音、靜音、暫停、啟動中取消、慢解碼及快速跳轉通過；播放未插入黑幀。
- phase2.cjs：涵蓋雙軌編輯、真實匯出、專案開啟/儲存、備份、範例與舊資料保留；另外確認編輯和匯出沒有背景專案/草稿寫入。
- browser.cjs：基本編輯、明確儲存後重開、橫直方向、720p/1080p 匯出與取消重試。
- update.cjs：8 項；從歷史 0.1.2 草稿升級，驗證原資料、復原副本、離線開啟及混合版本拒絕安裝。

仍需使用者在 iPhone 確認預覽畫面與原音。先前偶發匯出錯誤依使用者指示暫列待修；沒有證據證明自動草稿就是匯出失敗原因，不應宣稱已根治。
