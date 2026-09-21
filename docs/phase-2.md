# iPhone 0.2.0 — 第二階段：多軌剪輯與可靠專案

日期：2026-09-21。桌面基線 V13。此版只部署獨立 NiVedit-iPhone；桌面程式與還原点未修改。

## 使用者決定與保留問題

使用者確認 0.1.5 仍有偶發匯出錯誤，要求「先擱置，往下一階段」。因此本次不把匯出可靠性標為修復，也不繼續追查未知的實機失敗原因。保留前版 run sequence、清理舊檔、取消／重試／防連點、localStorage 最近錯誤紀錄。後續需收集 iPhone 型號／iOS／錯誤診斷再追查。

## 本次完成

- F04：新建、命名儲存、另存副本、專案清單、開啟／刪除、未存入清單的修改提示。
- F05：NVPROJ1 讀寫，7-byte magic + uint32LE header + JSON + Blob slices。保留未知 header/state/index 欄位與所有嵌入素材，驗證索引邊界與重複 key。缺素材保留片段並允許重新連結；缺素材時不輸出不完整備份。
- F06：原創合成 720p 小範例，從 00:00 開始，首次保存必須成為使用者副本。約 140 KB，非使用者私人影片。
- F09／F10／F14：多段影片、上下影音軌、各自留白、移軌、精確起點、拖移把手、接上一段、裁短、分割、刪除、復原／重做、橫向捲動、縮放／符合視窗與軌道區高度。
- F11–F13／F24 的圖片部分：靜態圖片獨立軌、停留時間、同軌重疊、晚開始者在上／同時維持穩定順序、透明露底、結束露出較早圖片；圖片可排在影音組上／下。GIF／標題層完整排序仍在第四階段。
- F32 基礎：兩條原聲相加，逐段靜音／音量；第五階段再補完整音軌、曲線、循環等。
- 0.1.x 草稿遷移、資料庫 v2 增加 projects store，原 drafts store 保留。
- 720p／1080p30 匯出包含基本多軌合成與圖片。單一無變換影片保留原 Conversion 路徑；多軌透過 CanvasSink → 共用 contain 合成 → CanvasSource，AudioSampleSink 分段混合後 AudioSampleSource → AAC，輸出優先 OPFS。

## 不可誤報為完成

此階段是資料互通，不是完整視覺互通。含未支援的轉場、構圖、裁切、關鍵幀、調色、字幕、標題、GIF、音樂或其他輸出規格時，畫面提示「基礎預覽」，保留原資料，暫停影片匯出，避免默默漏掉效果。效果片段暫停分割。第三至第八階段仍照原計畫。

iPhone 真機多軌播放、混音、1080p 多軌匯出、分享、系統中斷及長片低記憶體仍待驗證。Windows Edge 觸控視窗通過不等於 iPhone 通過。原本使用者確認的第一階段匯出正常，不能套用成第二階段已驗收。

## 驗證

- 11 個 model/project 核心測試通過：碰撞、留白、分割原素材時間、圖片前後順序、未知欄位與內嵌 bytes 保留、無效專案／缺素材拒絕。
- 22 項第二階段 Edge 觸控流程通過：多片段、雙軌、圖片、實際 MP4、草稿、命名／另存、NVPROJ、進階資料保留／阻止不完整輸出、缺素材重接、範例副本、留白、日夜／英文／橫向。
- 實際桌面 V13 程式：桌面 buildProjBlob → 手機 read/edit/write → 桌面 projImportFile，五片段、四素材，僅改一項來源起點；編輯參數與素材 SHA-256 保留。桌面 serialize 會依重建 File.lastModified 重算 mediaKey，測試只對此已知桌面行為做對應，手機回寫前的 key 原样保留。
- 額外本機大型既有 v12.2 專案（約 124 MB）往返：所有 state 除指定 inP 外一致，3 素材 SHA-256 一致；私人檔案及其內容未放進公開 repository。
- FFmpeg 獨立解碼：3 秒雙軌／圖片成品 3.008 秒；6 秒範例／留白成品 6.016 秒。圖片中心依次紅→綠→紅；雙音軌重疊 RMS 約 0.125→0.250→0.125，留白黑畫面均值 0／音訊 RMS 0。這是數值驗證，不宣稱人耳聽感驗收。
- 原 29 項單片段／720p／1080p／方向／草稿回歸通過。
- 原匯出 race 測試通過；這不代表使用者回報的其他偶發錯誤已解決。
- 7 項 0.1.2 → 0.2.0 更新測試通過：舊草稿原素材 bytes、離線回復與完整版本 hash 驗證。

測試腳本：tests/model.test.mjs、project.test.mjs、phase2.cjs、desktop-bridge.cjs、desktop-roundtrip.mjs、check-composition.py、browser.cjs、export-race.cjs、update.cjs。qa/ 為本機測試產物，不提交。

## 維護與下一步

新增 src/project-file.js、media.js、composition.js、multitrack-worker.js。完整狀態與素材 Map 存在 app；Undo 保存編輯 JSON，不複製影片。刪片段後尚未清除原媒體，以支援 Undo 並保留未識別引用；備份可能仍包含暫時未使用素材。命名專案採 IDB transaction 完成後才顯示儲存成功，瀏覽器儲存仍須外部 .nvproj 備份。

以 scripts/make-example.py 重新生成公開原創範例。任何應用／手冊更動需 scripts/release.py 重算發布 hash；新模組與範例已納入 Service Worker 校驗。

下一主要目標：第三階段完整構圖／裁切／起終點關鍵幀／轉場／調色，逐項移植 V13 語意並讓預覽與匯出共用。先請使用者驗收本版 iPhone 多片段、雙軌、圖片與專案保存。偶發匯出錯誤留在待修清單。
