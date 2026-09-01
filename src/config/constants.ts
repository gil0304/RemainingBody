/**
 * 作品全体のチューニング定数。
 * 展示調整はこのファイルの数値を変更する(spec §8, 9, 57 ほか)。
 */
export const CONFIG = {
  camera: {
    idealWidth: 1920,
    idealHeight: 1080,
    idealFps: 60,
    /** カメラ取得失敗時の再試行間隔 (ms) */
    retryMs: 6000,
  },

  segmentation: {
    wasmPath: 'wasm',
    models: {
      selfie: 'models/selfie_segmenter_landscape.tflite',
      deeplab: 'models/deeplab_v3.tflite',
    } as Record<string, string>,
    defaultModel: 'selfie',
    /** セグメンテーション処理の上限 fps (spec §55) */
    maxFps: 30,
    /** ライブマスクの時間方向 EMA 係数(高いほど追従が速い) */
    temporalBlend: 0.55,
    /** これ以上マスクが届かない場合、認識停止とみなす (ms) */
    staleMs: 1500,
    /** セグメンテーション初期化失敗時の再試行間隔 (ms) */
    retryMs: 8000,
  },

  /** ライブマスク / 残像テクスチャの内部解像度 (spec §56) */
  mask: {
    width: 512,
    height: 288,
  },

  presence: {
    /** 人物ありと判定するマスク被覆率 */
    enterCoverage: 0.01,
    /** 人物なしと判定する被覆率(ヒステリシス) */
    exitCoverage: 0.005,
    /** 被覆率が落ちてから退出とみなすまでの猶予 (ms) */
    exitDelayMs: 900,
    /** 暗闇から身体が浮かび上がる時間 (spec §33) */
    appearSeconds: 1.7,
    /** 退出後に現在の身体が消える時間 */
    disappearSeconds: 1.1,
  },

  shadows: {
    /** snapshotInterval (spec §8) */
    intervalMs: 900,
    /** maximumShadowAge (spec §9) */
    maxAgeMs: 60_000,
    /** MAX_SHADOWS (spec §57) */
    maxCount: 70,
    rtWidth: 512,
    rtHeight: 288,
    /** バウンディングボックスの余白(画面 UV 比) */
    bboxPadding: 0.12,
    /** snapshot を撮る最低被覆率 */
    minCoverage: 0.004,
    /**
     * 前回の snapshot から身体の中心がこれ以上動いていない場合は記録しない
     * (静止中に同位置へ加算が積み上がり白飛びするのを防ぐ。spec §39, §41)
     */
    minMoveDist: 0.04,
    /** 中心が動かなくても motionEnergy がこの値を超えれば記録(手を振る等) */
    minMotion: 0.22,
    /**
     * 影は撮影から この時間 は不可視。第一ゴーストがその瞬間を「通過」する
     * ときに初めてその場に凍って現れる(ghosts.taps[0].delayMs と一致させる)
     */
    revealDelayMs: 16_000,
    /** 現在の身体との重なりがこれ以上の間は顕現しない */
    revealOverlapMax: 0.25,
    /** 顕現済みの影にこれ以上重なると disturb(崩壊加速)が蓄積する */
    disturbOverlapMin: 0.4,
    /** 完全に崩れるまでの接触時間 (s) */
    disturbSeconds: 4,
  },

  /** 過去の自分がもう一度動く、ディレイ再生ゴースト */
  ghosts: {
    recordFps: 10,
    atlas: {
      size: 4096,
      cols: 16,
      rows: 28,
      tileW: 256,
      tileH: 144,
    },
    taps: [
      { delayMs: 16_000, intensity: 0.34, distort: 0.004 },
      { delayMs: 36_000, intensity: 0.16, distort: 0.010 },
    ],
  },

  motion: {
    /** マスク差分平均 → motionEnergy への増幅率 (spec §38) */
    gain: 14,
    /** 立ち上がり時定数 (s) */
    attack: 0.12,
    /** 減衰時定数 (s) */
    release: 1.6,
  },

  particles: {
    perShadow: 350,
    ambient: 260,
    /** 粒子化が始まる正規化年齢 (spec §24) */
    minAgeNorm: 0.3,
  },

  render: {
    /** devicePixelRatio の上限 (spec §53) */
    maxPixelRatio: 1.5,
    /** 適応解像度の下限スケール */
    minScale: 0.7,
    /** 適応解像度の判定間隔 (ms) */
    adaptIntervalMs: 4000,
  },

  /** 映像の質感パラメータ (spec §30, 52) */
  visual: {
    exposure: 1.45,
    bloomStrength: 0.12,
    bloomThreshold: 0.32,
    vignette: 0.3,
    grain: 0.045,
    bodyIntensity: 0.9,
    shadowIntensity: 1.0,
    particleIntensity: 0.4,
    dustIntensity: 0.05,
  },
} as const;
