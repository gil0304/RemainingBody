# 残る身体 / Remaining Body

カメラの前に立つ鑑賞者の身体をリアルタイムに認識し、その身体の「影」が時間差で空間に残り続けるインタラクティブ・メディアアート作品。

作品仕様の全文は [SPEC.md](SPEC.md) を参照。

**改訂ディレクション**: 現在の身体は実写(セグメンテーションで切り抜いた鏡像の人物)として表示し、過去の残像のみモノクロのシルエットとする(SPEC §5/§44 を作家指示で上書き)。現在の身体は記憶の手前に立ち、背後の影を隠す。`?body=silhouette` で従来の全シルエット表示に戻せる。

**時間の構造(改訂2)**: 過去は三つの層を持つ。

1. **動いている過去(ゴースト)** — マスクを常時リングバッファ録画し、16秒前・36秒前の自分が実際に動いて空間を再走行する。去った鑑賞者のゴーストは遅延分だけ歩き続け、次の鑑賞者は「まだ動いている知らない誰か」と出会う(SPEC §71)
2. **凍った過去(彫像)** — snapshot は撮影から16秒間不可視。第一ゴーストがその瞬間を通過するとき、その場に初めて凍って現れる(動く過去が彫像を置いていく)。現在の身体と重なっている間は現れない — 記憶は去った場所にだけ浮かぶ
3. **崩れる過去** — 彫像は60秒かけてボケ・溶解・粒子化して消える。さらに、現在の身体が彫像に触れると崩壊が恒久的に加速する(記憶は再訪すると壊れる)

## セットアップ

```bash
npm install
npm run dev        # 開発 (http://localhost:5173)
```

初回の `npm run dev` / `npm run build` 時に `scripts/prepare-assets.mjs` が自動実行され、

- MediaPipe の wasm を `public/wasm/` へコピー
- セグメンテーションモデル (.tflite) を `public/models/` へダウンロード

します。**一度ダウンロードすれば、以後は完全オフラインで動作します**(CDN 依存なし)。オフライン環境でセットアップする場合は、他マシンで取得した `public/models/*.tflite` を手動で配置してください。

## 本番(展示)

```bash
npm run build
npm run preview    # または dist/ を任意のローカルHTTPサーバーで配信
```

- カメラ許可が必要なため **http://localhost または https** で配信すること(file:// 不可)。
- ブラウザは Chrome / Edge 推奨。キオスクモード例:
  `chrome --kiosk --autoplay-policy=no-user-gesture-required http://localhost:4173`
- 起動後、画面クリック → `f` キーでフルスクリーン切替。
- カメラが取得できない間のみ、スタッフ向けに画面中央へ小さく `Camera unavailable` が表示され、6秒ごとに自動再試行します。

## URL パラメータ

| パラメータ | 説明 |
|---|---|
| `?debug=true` | デバッグ表示(FPS・カメラ映像・マスク・残像数・GPU情報など)。通常アクセスでは完全非表示 |
| `?body=silhouette` | 現在の身体を実写ではなく従来のシルエットで表示 |
| `?synthetic=1` | カメラの代わりに合成人物マスクで駆動(開発検証用) |
| `?audio=1` | ミニマルな環境音を有効化(初回クリック/キー入力で開始。既定はオフ) |
| `?model=deeplab` | セグメンテーションモデルを DeepLab v3 に切替(既定: selfie landscape)。遠距離・全身が安定しない場合の代替 |
| `?maskIndex=N` | confidence mask のインデックスを手動指定(現地でマスクが反転している場合の保険) |

## チューニング

展示調整用の定数はすべて [src/config/constants.ts](src/config/constants.ts) に集約:

- `shadows.intervalMs` — snapshot 間隔(既定 900ms)
- `shadows.maxAgeMs` — 残像の寿命(既定 60秒)
- `shadows.maxCount` — 最大残像数(既定 70)
- `visual.*` — 露出・ブルーム・ビネット・グレイン・各レイヤー強度

## プライバシー

映像・画像は一切保存せず、サーバーへも送信しません。すべての処理はローカルブラウザ内で完結します(人物の個人識別は行いません)。

## 実装構成

- Vite + TypeScript + Three.js (WebGL2) + MediaPipe Image Segmenter(すべてローカル配信)
- 加算合成の HDR シーン → 弱いブルーム → ソフトトーンマップ → ビネット + フィルムグレイン
- 残像は 70 個の R8 レンダーターゲットをプールして再利用(GPU メモリ固定・長時間展示対応)
- シェーダーで noise / edge distortion / blur / dissolve / particle breakup を年齢に応じて適用
