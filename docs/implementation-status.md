# Implementation Status

作成日: 2026-06-15

この文書は、現在の作業ツリー時点での実装状況をまとめたものです。未コミット変更を含むため、確定済みリリース状態ではなく「ローカルの現状」として扱います。

## Summary

- アプリは Vite + React + TypeScript + Three.js 構成です。
- 主機能である球体リトファン生成、3D プレビュー、STL エクスポートは実装済みです。
- 2:1 ではない画像も、白背景の 2:1 working image に変換して生成できる実装になっています。
- パラメータ、テクスチャ表示、照明、回転アニメーション、設定保存などの UI が実装済みです。
- `npm run build` は 2026-06-15 時点で成功しています。Vite の chunk size warning は残っています。

## Implemented Features

### Image Input And Working Image

- JPEG/PNG のアップロードに対応しています。
- 入力画像は `src/lithophane/imageDecode.ts` で `ImageData` に変換されます。
- `src/lithophane/workingImage.ts` で、任意アスペクト比の画像を 2:1 の working image に変換します。
- デフォルトは白背景パディングです。
- `imageScale` により画像を中央寄せのまま縮小できます。
- `paddingMode` は `pad` と `stretch` に対応しています。
- 水平/垂直反転オプションも生成処理とプレビューに渡されています。
- 大きい画像は working image 側で最大ピクセル数に基づき縮小されます。

### Lithophane Generation

- `src/lithophane/sphereLithophane.ts` に球体リトファン生成処理があります。
- 画像輝度を厚みに変換し、内外二重面を持つ `THREE.BufferGeometry` を生成します。
- 明るさカーブ、コントラスト、min/max thickness、minCos 補正に対応しています。
- 厚み方向は `outward` / `inward` を選択できます。
- 底穴・上穴の直径指定に対応しています。
- 穴位置は latitude / longitude の比率指定で回転配置できます。
- 底穴がある場合、簡易スタンド形状も生成します。
- 生成結果には vertex count と triangle count の summary が含まれます。

### Preview

- `src/components/Viewer.tsx` と `src/three/scene.ts` で Three.js プレビューを表示します。
- OrbitControls による回転/ズーム操作に対応しています。
- 外面、内面、壁/スタンドで material group を分けています。
- grayscale texture 表示を切り替えできます。
- プレビュー texture は生成時と同じ working-image 変換を通すため、scale / flip / padding mode の変更に追従します。
- 中心ライトの ON/OFF と intensity 調整に対応しています。
- 回転アニメーションの ON/OFF、回転軸、速度、描画 refresh rate を調整できます。

### Parameters And State

- 主要パラメータは `src/domain/params.ts` の `LithophaneParams` と `DEFAULT_PARAMS` に定義されています。
- `src/domain/validation.ts` で radius、thickness、hole、segments、contrast、brightness curve、minCos、imageScale などを検証します。
- アプリ状態は `src/domain/state.ts` の reducer で `idle -> imageLoaded -> generating -> ready/error` として管理します。
- ファイル選択後に自動生成はせず、ユーザーが `Build` を押して生成します。
- 生成中に古い非同期結果が戻った場合は、`src/App.tsx` の `runIdRef` により無視されます。
- パラメータや表示設定は `src/domain/preferences.ts` で `localStorage` に保存されます。

### Export

- `src/three/exporter.ts` で Three.js の `STLExporter` を使い STL を Blob 化します。
- UI の `Export STL` ボタンから `spherical-lithophane.stl` としてダウンロードできます。
- 生成中またはモデル未生成時の export error message を表示します。

## Spec Task Status

### `specs/001-sphere-lithophane`

- MVP の球体リトファン生成、プレビュー、パラメータ調整、STL エクスポートはタスク上ほぼ完了しています。
- 未完了として残っているのは `T037 Confirm defaults produce a successful first run` です。
- 現在のデフォルト値では build 自体は成功しますが、実画像を使った初回生成の手動確認はドキュメント上未完了です。

### `specs/002-aspect-padding`

- 任意アスペクト比画像の受け入れ、2:1 working image 変換、imageScale、preview texture の変換追従は実装済みです。
- 未完了として残っているのは以下です。
  - `T018` quickstart の手動検証手順の更新/再実行
  - `T021` `npm run build` の実行と回帰対応
  - `T022` 2:1 input + imageScale=1.0 の後方互換手動比較
- `T021` については、この文書作成時に `npm run build` を実行し成功しました。ただし tasks.md のチェック状態は未更新です。

## Verification

実行済み:

```sh
npm run build
```

結果:

- TypeScript build 成功
- Vite production build 成功
- 出力 chunk が 500 kB を超える Vite warning あり

未実行/未確認:

- ブラウザ上での手動操作確認
- 実画像アップロードによる 2:1 / 非 2:1 の生成比較
- STL を slicer に読み込んだ watertight / printable 確認
- imageScale 変更による形状差分の目視確認
- 反転/向き/texture と relief の一致確認

## Known Gaps And Risks

- `src/domain/contracts.ts` の `LithophaneParameters` は、実装済みの `imageScale`、flip、padding mode、穴位置、stand、contrast、thicknessDirection などをまだ反映していません。
- `validateEquirectangularAspectRatio` は残っていますが、現在の generation flow では非 2:1 画像を拒否しない方針です。将来の利用箇所で誤って呼ばないよう注意が必要です。
- パラメータ変更時は自動再生成ではなく、ユーザーが `Build` を押す設計です。仕様タスクの「parameter changes trigger regeneration」とは挙動が異なります。
- STL の printable quality はコード上で閉じた形状を目指していますが、slicer での実地確認は未完了です。
- UI はインライン style 中心で、デザインシステムやアクセシビリティの体系的な整理はまだありません。
- Vite build で bundle size warning が出ています。Three.js を含むため現時点では致命的ではありませんが、必要なら code splitting を検討します。

## Recommended Next Steps

1. `specs/002-aspect-padding/quickstart.md` に沿って手動検証を実施する。
2. 2:1 入力 + `imageScale=1.0` の出力を以前の出力と比較する。
3. STL を slicer で開き、穴/スタンド込みで printable な solid になっているか確認する。
4. 実装済みパラメータに合わせて `src/domain/contracts.ts` を更新する。
5. 仕様タスクのチェック状態を、実際に確認できた範囲だけ更新する。
