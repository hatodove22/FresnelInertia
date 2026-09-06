# Container Haptics — 日本語原理解説動画

現在のサイト掲載版は、実CAD機構の動きを全章で示す英語動画です。
生成・出典・検証は [English CAD film README](VIDEO_EN_README.md) を参照してください。
以下は保存してある従来の日本語版の制作記録です。

109.37秒、1920 × 1080、30 fps。H.264 / AAC MP4、fast-start対応。
日本語音声はAI合成（Microsoft Edge TTS、ja-JP-NanamiNeural）。

## 配信用ファイル

- `container-haptics-explainer-ja.mp4`：音声・焼き込み日本語字幕付き動画
- `poster.png`：動画ポスター
- `captions-ja.vtt`：日本語字幕。焼き込み字幕もあるため、プレイヤー上では任意表示にする
- `transcript-ja.md`：台本・出典・表現の境界
- `timeline.json`：章と字幕の実際の時間

## 表現と出典

冒頭の機構は `../explainer-assets/device-cad.glb` の実CAD形状をThree.jsで描画したもの。
Fusion `VRSJ2026 v30` から抽出した可視BRep形状で、原CADは変更していない。
接触面をオレンジ、振動子を青緑で強調した。材料色は説明上の表現である。
CADには旧M5 ATOM Matrixの外形が含まれ、現行カスタムPCBは含まれていない。
現在の制御機器・接続の説明は、リポジトリのAtomS3 / StampC5構成に従う。
モデルを回して構造を見せており、冒頭CAD内で実サーボの駆動動作は再現していない。

後続は読みやすさを優先した原理の模式アニメーション。
実機の記録映像、測定波形、実流体計算、実測された知覚効果ではない。
現在の触覚内容モデルはbody x/yの縮約モデル。
二つのXL330接触面は並列の低周波出力で、4層＋Spatial4の振動経路とは別の出力枝。
素材間でこの道筋を共有する。FSRによる握力計測は未実装。
調整スタジオとAndroid ARは将来計画として明確に表示している。

事実は以下を確認した。

- `../../docs/00_DESIGN_SPECIFICATION.md`
- `../../docs/16_PROGRESS_STATUS.md`（2026-09-05の記録）
- `../../docs/04_HARDWARE_AND_PIN_SPEC.md`
- `../../docs/reference/03_PIPELINE_SPEC.md`
- `../../docs/reference/14_TILT_PSEUDOFORCE_SPEC_REV2.md`
- `../explainer-assets/device-cad-metadata.json`

## 再生成

Windowsの游ゴシックとBahnschrift、Python 3.12、ffmpeg / ffprobeを使用。
Node.jsと、リポジトリ既存の `webxr/node_modules` 内のThree.js / Playwrightを使用する。
コマンドはリポジトリルートで実行する。

```powershell
python -m pip install -r output/explainer-video/requirements.txt
node output/explainer-video/render-cad.mjs
python output/explainer-video/create_video.py --audio --preview --render
node output/explainer-video/verify-video.mjs
```

音声生成はネットワークを使用。生成済みの音声キャッシュがあれば再利用する。
`render-cad.mjs` は一時的なlocalhost HTTPサーバーと非表示のChromiumを作り、
終了時に閉じる。実CADファイルがない場合は、`create_video.py` の原理容器図へフォールバックする。
`--preview` のみで8章のPNGとコンタクトシートを生成できる。
`--render` のみなら音声を再生成せずMP4を出力する。

## 検証

`verification.json` にメディア再生検証を記録する。
Pillowの全8章のコンタクトシートと、Three.jsの実CADレンダーを目視確認した。
見出し、字幕、凡例の読みやすさを確認し、CADと説明文の重なりを修正した。
FFmpegで動画全体のデコード検査がエラーなしで完了した。
ffprobeで1080p / 30fps、映像109.366667秒・音声109.366秒を確認した。
Chromiumで完成MP4の再生と5 / 46 / 75 / 102秒へのシークが成功し、ページエラーはゼロ。
完成MP4をブラウザーで表示した5秒・75秒のフレームも目視確認した。
音声は平均-15.8 dB、ピーク-1.1 dBでクリッピングなし。
字幕16区間は順序・動画時間内への収まりを確認した。
これは説明メディアの検証であり、新しい実機・触覚の試験ではない。
