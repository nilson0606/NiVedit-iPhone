# NiVedit iPhone 0.2.2：預覽卡頓與解碼中斷處理

## 使用者回報與狀態

使用者在 iPhone 16 Pro Max、iOS 26.6.2（使用者提供版本）播放 13 秒影片：
- 聲音與畫面持續卡頓。
- 預覽或播完偶發卡住，已回報不只一次。

0.2.1 的 Windows Edge 短素材測試不足以驗證真機流暢度。增加 13 秒 1080p60 與 4 倍主執行緒 CPU 限速後，舊版在本機仍能順播，因此**尚未重現使用者真機的持續卡頓，不應宣稱已確認全部根因或已在 iPhone 修好**。使用者明確不提供原片，以免針對個案特調；後續不再要求，改用多種通用合成素材與裝置診斷驗證。

## 本次程式變更

- src/preview-worker.js：影片與音訊解碼、影片縮放與圖層合成移至專用 worker。使用 VideoSampleSink，在原始解碼畫格中略過過期畫格，只縮放選中的畫格一次；不再在主執行緒用 CanvasSink 逐幀做多級縮放及多次畫布複製。匯出渲染不變。
- 一次只有一個畫格請求在途；最新播放位置覆蓋尚未送出的舊要求。回傳可轉移 ImageBitmap，主執行緒僅顯示合成結果並立即釋放 bitmap。
- 音訊用 AudioSampleSink 在 worker 解碼成平面 PCM，以 transfer list 移交主執行緒。AudioContext 仍在實際播放手勢內解鎖；預先排程 2 秒，剩餘不足 1.5 秒才補充，減少短暫排程延遲導致斷音。保留雙軌原音、音量、靜音、時間位置及裁剪規則。
- src/preview-decoder.js：暫停、定位、換專案及播完直接 terminate worker，立即結束等待中的請求，不等待可能卡住的 iterator.next/return 或 decoder flush。
- 播完保留最後完整顯示畫面，不再啟動一次尾幀隨機解碼。再按播放由起點重新啟動。
- 播放中的畫格請求 3 秒無回應會停止，其他解碼要求上限 15 秒；可以再按播放重試。這是錯誤恢復保護，不代表素材本身已能順播。
- 裝置診斷增加每次播放的畫面數、最長畫面間隔、主執行緒 tick 間隔與 worker 狀態。

## 驗證範圍

tests/preview-stress.cjs 使用實際 13 秒 1920×1080、60 fps、H.264 B-frame 與 AAC 合成素材：
- 連播到底及重播五輪，量測畫面更新間隔與真實 Web Audio 輸出圖的靜音樣本。
- 主畫面執行緒 4 倍 CPU 限速；確認播放解碼器不在主執行緒建立。
- 12 次暫停、定位、重播循環。
- 測試伺服器注入 worker 無窮迴圈，驗證手動暫停可以立即終止，之後重播可用。
- 播放中注入卡死，驗證自動超時退出及後續重播。
- 播放後仍能剪輯及復原。

既有 preview-playback.cjs 保留雙軌聲音比例、靜音、暫停、無黑幀和快速跳轉檢查；慢解碼注入改為真的延遲 worker 回傳，沒有保留失效的 CanvasSink monkey patch。
phase2.cjs、browser.cjs 與 update.cjs 驗證其餘編輯、輸出、專案和離線升級。

這些測試全是 Windows Edge，**不是 iPhone Safari**。合成素材沒有涵蓋使用者原片的未知編碼/HDR 特性。0.2.2 是待真機確認的修正，不能把測試通過寫成使用者問題已完全解決。先前偶發匯出問題仍獨立列待修。

## 後續接手

使用者不提供原始影片，不要再索取或做個案特調。優先讀取 iPhone 上本版的「裝置」診斷，並以不同長度、解析度、影格率及圖層的通用素材驗證。根據 maxFrameGapMs、maxTickGapMs、lateBuffers 和 previewError，區分背景解碼落後、UI/GPU 顯示阻塞和音訊排程中斷。不要再只用短測試片和手機尺寸模擬聲稱真機驗收完成。

本機 D:\NiVedit\NiVedit-iPhone；獨立網站 https://nilson0606.github.io/NiVedit-iPhone/ 。桌面版未變更。

## 本次執行結果

最終 preview-stress.cjs 全部 10 項通過。五輪完整播放的穩定區間各有 365–366 次不同畫格，畫格年齡 P95 為 30–31 ms、最大 37–42 ms，Web Audio 輸出圖未量到靜音樣本。12 次暫停/定位循環、手動中止卡死、播放中超時退出與再次播放都通過。

preview-playback 8 項、phase2 23 項、browser 29 項、update 8 項通過。這些數字不是 iPhone 效能成績；舊版在同一電腦也能順播，仍不可宣稱已重現真機問題。測試產物保留於忽略的 qa/，不含使用者原片。
