/**
 * Mozkey公式ページのコンテンツ・外部リンク・配布状況の単一管理元。
 * 署名・対応OSは公開前に公式Releasesと照合すること。
 * 実機素材が無い間は media.*.available を false にする（架空の画面を表示しない）。
 */
export const mozkey = {
  name: "Mozkey",
  pageTitle: "Mozkey（もずきー）| 書くことに集中できる、日本語入力。",
  description:
    "Mozkeyは、Mozcをベースにしたオープンソースの日本語IME。ライブ変換、ローカルZenzによる文脈補正、学習とカスタマイズで、日本語入力を自分らしく。",
  canonical: "https://koyasi777.com/mozkey/",
  links: {
    repository: "https://github.com/koyasi777/mozkey",
    readme: "https://github.com/koyasi777/mozkey/blob/main/README.md",
    releases: "https://github.com/koyasi777/mozkey/releases",
    signing: "https://github.com/koyasi777/mozkey/blob/main/CODE_SIGNING_POLICY.md",
    notices: "https://github.com/koyasi777/mozkey/blob/main/THIRD_PARTY_NOTICES.md",
    security: "https://github.com/koyasi777/mozkey/blob/main/docs/security/offline_guarantee.md",
    mozc: "https://github.com/google/mozc",
    zenz: "https://github.com/ensan-hcl/zenz",
    llama: "https://github.com/ggml-org/llama.cpp",
    creator: "https://koyasi777.com/",
  },
  /** Release assets confirmed via official GitHub Releases API, 2026-11-01. */
  distribution: {
    checkedOn: "2026-11-01",
    version: "v1.0.0",
    publishedAt: "2026-11-01T03:45:22Z",
    checksumsUrl: "https://github.com/koyasi777/mozkey/releases/download/v1.0.0/SHA256SUMS.txt",
    assets: {
      windowsX64: {
        name: "Mozkey_v1.0.0_x64.msi",
        url: "https://github.com/koyasi777/mozkey/releases/download/v1.0.0/Mozkey_v1.0.0_x64.msi",
        sizeLabel: "109 MB",
        sha256: "a779f0fc09366100778c469923bd94aff2a52aa69b4d23e8d0258395c60547f6",
      },
      windowsArm64: {
        name: "Mozkey_v1.0.0_arm64.msi",
        url: "https://github.com/koyasi777/mozkey/releases/download/v1.0.0/Mozkey_v1.0.0_arm64.msi",
        sizeLabel: "109 MB",
        sha256: "61f879637d84863dcf159844a86dbebc4efb54b00c42893ea09fc2668a68a999",
      },
      macosUniversal: {
        name: "Mozkey_v1.0.0_macos_universal.pkg",
        url: "https://github.com/koyasi777/mozkey/releases/download/v1.0.0/Mozkey_v1.0.0_macos_universal.pkg",
        sizeLabel: "171 MB",
        sha256: "fe50c1ddcc7a590aee057b4fa60755d669b9523dbd94ebb0c7c7c1e61ff65bea",
      },
    },
  },
  media: {
    hero: {
      available: true,
      video: "/mozkey/media/hero.webm",
      mp4: "/mozkey/media/hero.mp4",
      poster: "/mozkey/media/hero.webp",
      label: "入力からライブ変換へ",
      description: "入力途中から候補が変化するライブ変換に対応。ちらつきを抑えるため、変換タイミングも調整できます。",
    },
    natural: {
      available: true,
      video: "/mozkey/media/natural.webm",
      mp4: "/mozkey/media/natural.mp4",
      poster: "/mozkey/media/natural.webp",
      label: "同じ読みも、文脈に合わせて",
      description: "同音異義語も、前後の文脈に合った変換を行います。Zenz補正は手動実行にも対応し、自動補正の開始タイミングも自由に設定できます。（動画上は700msの遅延設定時）",
    },
    learning: {
      available: true,
      video: "/mozkey/media/learning.webm",
      mp4: "/mozkey/media/learning.mp4",
      poster: "/mozkey/media/learning.webp",
      label: "選択を学ぶ",
      description: "一度選んだ表記を学び、次回以降の変換候補に反映します。確定直後にBackspaceやUndoで修正した場合は、その操作に応じて直前の学習も取り消します。",
    },
    customization: {
      available: true,
      video: "/mozkey/media/customization.webm",
      mp4: "/mozkey/media/customization.mp4",
      poster: "/mozkey/media/customization.webp",
      label: "自分だけの入力環境へ",
      description: "候補ウィンドウや入力モード表示の配色・サイズなどを、自分好みに細かく調整できます。",
    },
  },
} as const;
