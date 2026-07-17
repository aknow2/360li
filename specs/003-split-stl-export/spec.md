# Feature Specification: Spherical Lithophane Split Preview / STL Export

**Feature Branch**: `003-split-stl-export`  
**Created**: 2026-07-16  
**Status**: Draft  
**Input**: User description: "横方向と縦方向の分割数、および Split Index を指定し、Build では選択した球体パーツだけを Preview に表示し、Export STL では表示中のパーツだけを出力したい"

**Specification Precedence**: For this feature, this specification supersedes only the automatic model-splitting exclusion in `specs/001-sphere-lithophane/spec.md`. Joinery and connector behavior remain out of scope unless explicitly listed as future behavior here.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Select and preview one spherical part (Priority: P1)

ユーザーとして、球体を横方向・縦方向のグリッドに分割し、1-based の Split Index で選んだ1パーツだけを Build して Preview したい。

**Why this priority**: 大きな球体を印刷可能な大きさに分けるための中核機能であり、選択位置を視覚的に確認できなければ誤ったパーツを出力する危険があるため。

**Independent Test**: 方向マーカー付き画像を使用し、Horizontal split count = 2、Vertical split count = 2、Split Index = 3 で Build し、定義された3番目のパーツだけが Preview に表示されれば達成。

**Acceptance Scenarios**:

1. **Given** 有効な画像と分割設定がある, **When** ユーザーが Build を押す, **Then** Preview には Split Index が指すパーツだけが表示され、球体全体や他パーツは表示されない
2. **Given** Horizontal split count = 1、Vertical split count = 1、Split Index = 1 である, **When** ユーザーが Build を押す, **Then** 現行と同じ球体全体が表示される
3. **Given** 生成済みパーツが Preview にある, **When** ユーザーが分割数または Split Index を変更するが Build は押さない, **Then** 表示中のパーツは変化せず、次の Build 開始時に処理中表示へ移り、成功時に新しいパーツへ置き換わる

---

### User Story 2 - Export exactly the displayed part (Priority: P1)

ユーザーとして、Preview で確認しているパーツと完全に同じ形状だけを STL として保存し、誤って球体全体や別 Index のパーツを印刷しないようにしたい。

**Why this priority**: Preview と STL が一致することは、分割出力を信頼して印刷するための必須条件であるため。

**Independent Test**: Split Index = 2 で Build した後に STL を出力し、Preview の三角形集合と STL の三角形集合が座標・向きとも一致し、他パーツの面を含まないことを確認できれば達成。

**Acceptance Scenarios**:

1. **Given** 選択パーツが Preview に表示されている, **When** ユーザーが Export STL を押す, **Then** 表示中の生成済み geometry だけが STL に書き出される
2. **Given** Build 後に Split Index を変更したが再 Build していない, **When** ユーザーが Export STL を押す, **Then** 未 Build の Index ではなく、現在 Preview に表示されている直前の Build 結果が出力される
3. **Given** Build 中、Build 失敗後、または表示可能な生成結果がない, **When** Export STL の可否を確認する, **Then** 無効な STL は出力できず、ユーザーに現在の状態が分かる

---

### User Story 3 - Identify and reassemble parts deterministically (Priority: P2)

ユーザーとして、同じ分割設定なら毎回同じ Index が同じ球面領域を指し、全 Index を別々に出力したときに人工的な隙間なく元の球体形状へ再組立てできるようにしたい。

**Why this priority**: Index の対応が不定または境界がずれると、必要なパーツの管理と物理的な再組立てができないため。

**Independent Test**: Width segments = 10、Height segments = 5、Horizontal split count = 3、Vertical split count = 2 で全6 Index を生成し、規定の割当てが横 4/3/3、縦 3/2 セグメントになり、隣接境界の座標が一致することを確認できれば達成。

**Acceptance Scenarios**:

1. **Given** 方向マーカー付き作業用画像と複数分割がある, **When** Index を 1 から総パーツ数まで順に Build する, **Then** Index は穴回転前のローカル分割 UV における行優先順で、南側の行から北側の行へ、各行では `splitU=0` 側から `splitU=1` 側へ進む
2. **Given** セグメント数が分割数で割り切れない, **When** 各パーツを生成する, **Then** 余りセグメントは小さい行番号・列番号から1つずつ割り当てられ、セグメントの欠落・重複はない
3. **Given** 同一設定で全 Index の STL がある, **When** 同じ座標系で配置する, **Then** 外面・内面・既存の穴・スタンドは未分割モデルと同じ位置になり、共有分割境界に人工的な隙間がない

---

### User Story 4 - Keep existing geometry options in split parts (Priority: P2)

ユーザーとして、上下の穴、スタンド、穴位置回転、厚み方向、画像変換、テクスチャ、セグメント設定を使ったまま、選択パーツを閉じた印刷可能なソリッドとして生成したい。

**Why this priority**: 分割のために既存機能を無効化すると、現在作成できるモデルを分割印刷できず、要求された機能範囲を満たさないため。

**Independent Test**: 上下穴、下穴スタンド、非ゼロの穴緯度・経度、inward 厚み、flip、pad、テクスチャ表示を有効にしたモデルを 3×2 に分割し、各 Index が選択領域だけを含む閉ソリッドであることを検証できれば達成。

**Acceptance Scenarios**:

1. **Given** 穴またはスタンドが分割境界を横切る, **When** 隣接パーツをそれぞれ Build する, **Then** 各パーツにはそのセルと交差する部分だけが含まれ、穴やスタンド内腔を誤って塞がずに全境界が閉じられる
2. **Given** holeLatitude または holeLongitude が変更される, **When** 同じ Split Index を再 Build する, **Then** ローカル分割グリッド、上下穴、スタンド、分割壁は同じ既存回転で一体移動し、画像・凹凸の最終モデル上の向きは現行どおり固定される
3. **Given** thicknessDirection が outward または inward である, **When** 分割パーツを生成する, **Then** 分割壁はその位置の実際の内外面を接続し、設定された厚み方向と厚み分布を保つ

---

### User Story 5 - Recover settings and correct validation errors (Priority: P3)

ユーザーとして、分割設定の誤りをその場で理解して修正でき、再読み込み後も有効な分割設定を再入力せずに使いたい。

**Why this priority**: 大きな Index や分割数を繰り返し扱う際の入力ミスと再作業を減らし、既存ユーザーの保存設定も安全に移行するため。

**Independent Test**: 無効値で Build がブロックされること、有効な 3×2 / Index 5 を保存して再読み込みすると同じ値が復元されること、旧保存データでは 1×1 / Index 1 が補完されることを確認できれば達成。

**Acceptance Scenarios**:

1. **Given** 分割数が整数でない、範囲外、または Split Index が総パーツ数を超えている, **When** 入力値が検証される, **Then** 該当フィールドの近くに修正方法を示すエラーが表示され、Build は実行できない
2. **Given** 有効な分割設定がある, **When** ページを再読み込みする, **Then** 3つの分割設定は復元されるが、画像・Preview・STL は復元されず、再度画像選択と Build が必要になる
3. **Given** 分割設定を持たない旧バージョンの保存データがある, **When** アプリを読み込む, **Then** 他の既存設定を保持したまま 1×1 / Index 1 が補完される

### Edge Cases

- **EC-001**: Horizontal / Vertical split count が 0、負数、小数、`NaN`、無限大、空欄の場合は整数として受理せず、Build をブロックする
- **EC-002**: Horizontal split count が Width segments を超える、または Vertical split count が Height segments を超える場合は、各パーツに最低1セグメントを割り当てられないためエラーにする
- **EC-003**: Split Index が 0、負数、小数、総パーツ数超過の場合はエラーにする。Index は常に 1-based とし、0-based 値へ暗黙変換しない
- **EC-004**: 分割数を減らして現在の Split Index が新しい総パーツ数を超えた場合、Index を自動補正せずエラーを表示する
- **EC-005**: Width / Height segments が分割数で割り切れない場合、余りを小さい列・行番号へ決定的に配分する
- **EC-006**: 分割数が対応セグメント数と等しい場合、各パーツへちょうど1セグメントを割り当て、ゼロ幅セルや縮退した追加面を作らない
- **EC-007**: `splitU=0/1` の継ぎ目、ローカル南北極、または極を含むパーツでも、継ぎ目の欠落、開いたエッジ、非多様体エッジを作らない
- **EC-008**: 分割境界が上穴・下穴の縁と交差または接する場合、穴を塞ぐ面やゼロ面積三角形を作らず閉ソリッドを維持する
- **EC-009**: 回転された穴またはスタンドが複数セルを横切る場合、全体を各パーツへ複製せず、各セルとの交差部分だけを残す
- **EC-010**: 現行バリデーション上限内の大きな上下穴を使用し、選択セルに正の体積を持つ単一ソリッドが残らない場合、生成を成功扱いにせず、Index または穴設定の変更を促す回復可能なエラーにする
- **EC-011**: inward 厚みで内面半径が小さい場合も、分割壁の頂点順序と法線を正しくし、内外面を交差させない
- **EC-012**: flipHorizontal、flipVertical、pad / stretch、Image scale の組合せは分割後に再クロップ・再スケールせず、全パーツで同じ作業用画像 UV を共有する
- **EC-013**: Build 後に未 Build の設定変更や入力エラーがあっても、Preview が残っている間の Export は表示中の直前の成功結果だけを出力する
- **EC-014**: Build の途中失敗またはリソース不足では部分的・開いた geometry を Preview / Export へ公開せず、UI を再操作可能な状態へ戻す
- **EC-015**: 旧形式、欠落フィールド、不正型、破損 JSON の保存設定では、欠落・解釈不能な分割値だけをデフォルトへ戻し、アプリを起動不能にしない
- **EC-016**: 横または縦の一方だけが `1` の場合、その方向には新しい分割壁を追加せず、もう一方の方向に必要な境界だけを閉じる

## Requirements *(mandatory)*

### Split Parameters

| UI label | Parameter name | Default | Valid range and meaning |
|---|---|---:|---|
| Horizontal split count | `horizontalSplitCount` | `1` | 整数。`1 <= horizontalSplitCount <= widthSegments`。経度方向の列数 |
| Vertical split count | `verticalSplitCount` | `1` | 整数。`1 <= verticalSplitCount <= heightSegments`。緯度方向の行数 |
| Split Index | `splitIndex` | `1` | 1-based 整数。`1 <= splitIndex <= horizontalSplitCount * verticalSplitCount` |

分割数は現在の Width / Height segments に対する動的上限を使用し、別の固定上限や暗黙の丸めは設けない。3つのデフォルト値は、ユーザー操作なしで現行の球体全体を生成する。

### Coordinate System, Ordering, and Segment Allocation

- 分割は、穴回転を適用する前のベース球体にある Width / Height セグメント格子のローカル分割 UV（`splitU`, `splitV`）を基準にする。これにより分割境界を既存のセグメント境界へ一致させる。画像・凹凸・Preview texture 用の画像 UV（`imageU`, `imageV`）とは区別する
- 穴回転前のローカル方向を正規化したベクトル `dLocal=(x,y,z)` とし、`theta=acos(clamp(y,-1,1))`、`phi=atan2(z,-x)`（負なら `2*pi` を加算）、`splitU=1-phi/(2*pi)`、`splitV=1-theta/pi` とする
- ローカル `splitU=0/1` の継ぎ目は `-X` 方向である。`splitU` の増加方向は `-X -> -Z -> +X -> +Z -> -X` である。`splitV=0` はローカル南極 `-Y`、`splitV=0.5` は赤道、`splitV=1` はローカル北極 `+Y` である
- 行1は穴回転前のローカル南極側、列1はローカル `splitU=0` 側から始まる。holeLatitude = 0、holeLongitude = 0 の場合に限り、現行サンプラーの作業用画像上端 / 左端（`imageV=0` / `imageU=0`）とこの開始位置が一致する
- 分割面を閉じた後、現行と同じ `tilt=(holeLatitude/100)*pi`、`spin=(holeLongitude/100)*2*pi`、`R=Ry(spin)*Rx(tilt)` を選択パーツ全体へ適用する。したがって最終モデルでの分割境界方向は `R*dLocal` となり、分割グリッド、上下穴、スタンド、分割壁は一体で回転する
- 画像・凹凸の UV は現行どおり最終方向 `dFinal=R*dLocal` から同じ角度式で `imageU`, `imageV` を求める。このため穴回転時も画像の最終モデル上の向きは変わらないが、同じ Split Index に現れる画像領域は変わり得る。パーツごとに画像をクロップして UV を 0..1 へ引き伸ばしてはならない
- `H=horizontalSplitCount`、`V=verticalSplitCount` とし、行 `r`、列 `c` はともに1-based とする。Index は行優先で `splitIndex=(r-1)*H+c` とする
- 横セグメント数 `W=widthSegments` に対し `qW=floor(W/H)`、`rW=W mod H` とし、列 `c <= rW` には `qW+1`、それ以外には `qW` セグメントを割り当てる。縦も `T=heightSegments`、`qT=floor(T/V)`、`rT=T mod V` として同じ規則を行へ適用する
- 各境界の `splitU` / `splitV` は割当て済みセグメント数の累積値を `W` または `T` で割った値とする。隣接パーツは同一の既存セグメント境界頂点列を別々の閉ソリッド境界として共有し、その後に同じ `R` を適用する

### Functional Requirements

- **FR-001**: システムは、Horizontal split count、Vertical split count、Split Index の3つの数値入力を Parameters 内に提供すること
- **FR-002**: システムは、3つの分割パラメータのデフォルトをすべて `1` とし、初回利用・旧設定移行時に自動適用すること
- **FR-003**: システムは、Horizontal / Vertical split count を整数として検証し、それぞれ `1..widthSegments`、`1..heightSegments` の範囲だけを受け付けること
- **FR-004**: システムは、Split Index を 1-based 整数として検証し、`1..(horizontalSplitCount * verticalSplitCount)` の範囲だけを受け付けること
- **FR-005**: システムは、行1を穴回転前のローカル `splitV=0` の南極側、列1をローカル `splitU=0` 側とする行優先順で、同じ分割数・セグメント数から常に同じ Index 対応を得ること
- **FR-006**: システムは、分割範囲を穴回転前の Width / Height セグメント格子に基づくローカル分割 UV で決め、画像・凹凸・テクスチャには最終方向から求める現行の画像 UV を別に維持すること
- **FR-007**: システムは、セグメント数が分割数で割り切れない場合、商と余りの規則で小さい列・行番号へ余りを1つずつ割り当てること
- **FR-008**: Build はボタン押下時の画像と全パラメータのスナップショットを使い、検証成功後に指定 Index の geometry を1回生成すること
- **FR-009**: Build 成功時、Preview は選択パーツだけを単独表示し、球体全体、他 Index、選択範囲ガイド用の追加 geometry を表示しないこと
- **FR-010**: パラメータ変更だけでは自動生成せず、Preview と Export 対象は次の Build を開始するまで直前の成功結果を保持すること
- **FR-011**: 有効な Build を開始した時点で直前の Preview geometry をクリアし、Build 中は重複 Build と Export を無効化して処理中であることを表示し、成功結果が完成する前の一部 geometry を公開しないこと
- **FR-012**: Export STL は再生成を行わず、その時点で Preview が参照している同一の生成済み geometry を唯一の入力として使用すること
- **FR-013**: Built Part に記録された Build 時スナップショットを使い、1×1 / Index 1 の STL ファイル名は現行の `spherical-lithophane.stl` を維持し、分割時は `spherical-lithophane-h{H}-v{V}-part-{index}-of-{H*V}.stl` とすること
- **FR-014**: 分割 STL は選択パーツの三角形だけを含み、他パーツ、球体全体、Preview 専用オブジェクト、テクスチャデータを含めないこと
- **FR-015**: 分割処理は、現行設定で穴回転前に得られる球体シェル、上下穴、下穴スタンドを選択ローカル分割セルで切り出して閉じ、その選択ソリッド全体へ現行の穴回転を適用した結果として振る舞うこと。実装上の最適化は、この結果を変えてはならない
- **FR-016**: 成功した各選択パーツは、正の体積を持つ単一の連結した閉ソリッドであり、開いたエッジ、非多様体エッジ、自己交差、遊離面、ゼロ面積三角形を含まないこと
- **FR-017**: システムは、選択セルの切断位置で実際の外面と内面を接続する分割境界壁を生成し、すべての新しい切断輪郭を watertight に閉じること
- **FR-018**: 隣接パーツの共有分割境界は、元のセグメント境界から導いた同一座標・同一分割を使い、別々に生成・STL 出力しても幾何学的に一致すること
- **FR-019**: 分割境界に隙間、重なり代、オフセット、鋸しろ、勘合クリアランス、追加壁厚を加えず、同じ穴回転を適用した全パーツの外面・内面の和集合を未分割モデルと一致させること
- **FR-020**: 上穴、下穴、standWallThicknessMm を反映したスタンドがローカルセル境界を横切る場合、各パーツには交差部分だけを含め、意図した開口部・スタンド内腔を分割壁で塞がないこと
- **FR-021**: holeLatitude / holeLongitude は現行どおり `R=Ry(spin)*Rx(tilt)` により、上下穴、スタンドに加えて選択シェルと分割壁も一体で回転すること。ローカル分割セルに対する穴・スタンドの所属 Index は変えず、画像・凹凸の最終モデル上の向きは現行どおり固定すること
- **FR-022**: outward / inward の両厚み方向で、未分割モデルと同じ内外半径・明暗厚み分布を使い、分割壁はその地点の内外面を直接接続すること
- **FR-023**: imageScale、flipHorizontal、flipVertical、paddingMode、brightnessCurve、contrast、minCos は未分割時と同じ順序・意味で作業用画像と厚みに適用し、その後も全パーツで最終方向由来の共通画像 UV を共有すること
- **FR-024**: Show grayscale texture が有効な場合、選択パーツの既存外面だけへ Build 時スナップショットと同じ作業用画像・UV のテクスチャを表示し、内面・穴壁・スタンド壁・新しい分割壁にはテクスチャを引き伸ばさないこと。Show grayscale texture 自体の表示切替は再 Build なしで行えるが、未 Build の imageScale、flip、paddingMode 変更を表示中 Built Part のテクスチャへ先行適用しないこと
- **FR-025**: Width / Height segments は未分割モデルの解像度であると同時に分割可能数の動的上限とし、分割のためにセグメント設定を暗黙変更しないこと
- **FR-026**: Horizontal = 1、Vertical = 1、Index = 1 の場合は分割境界壁を一切追加せず、同一入力・既存パラメータに対する position / uv / index / material group、頂点数、三角形数、Preview、binary STL バイト列を機能追加前と同一にすること
- **FR-027**: 無効な分割入力では該当フィールド付近に範囲と整数条件を含むエラーを表示し、値を丸める・切り捨てる・自動 clamp することなく Build を無効化すること
- **FR-028**: 直前の成功結果が Preview に残っている場合、未 Build の入力変更または入力エラーがあっても Export はその表示中 geometry に限って許可し、現在の入力値からファイル名や形状を推測しないこと
- **FR-029**: システムは、3つの分割パラメータを他のユーザー設定と同じローカル設定へ保存し、有効値をページ再読み込み後に復元すること
- **FR-030**: 旧保存データで分割フィールドが欠落している場合は個別に `1` を補完し、不正型・非有限値は対応するデフォルトへ戻すこと。型として読めるが範囲外の値は黙って補正せず通常の入力エラーとして表示すること
- **FR-031**: ページ再読み込み時は画像ファイル、生成済み geometry、Preview、STL 出力可能状態を復元せず、復元した設定で再度画像選択と Build を要求すること
- **FR-032**: 選択セルに正の体積を持つ単一の閉ソリッドを生成できない場合、システムは回復可能な生成エラーを示し、不正 geometry の Preview / Export を許可しないこと
- **FR-033**: Preview は小さな選択パーツでも全体を確認できるよう表示範囲を生成 geometry に合わせ、現行の回転・ズーム・照明・アニメーション操作を維持すること
- **FR-034**: 本機能はブラウザ内だけで画像処理、geometry 生成、Preview、STL 出力、設定保存を完結し、公開 API、ネットワーク API、サーバー、アカウントを追加しないこと
- **FR-035**: 新しい Source image を選択した場合は、旧画像から生成した Preview と Export 対象を直ちにクリアし、新しい画像で Build が成功するまで Export を無効化すること

### Requirement Acceptance Criteria

- **AC-001 (FR-001..FR-007)**: holeLatitude = 0、holeLongitude = 0 で方向マーカー付き画像を 3×2 に分割すると、Index 1..6 が定義どおりのローカル分割 UV 領域へ一意に対応し、10×5 セグメントでは横 4/3/3、縦 3/2 になる
- **AC-002 (FR-008..FR-014, FR-028, FR-035)**: Build 後に入力値を変更しても Preview は変わらず、Export した STL の三角形集合と表示中 geometry が一致し、未 Build 値のパーツは含まれない。次の Build 開始時または新しい画像選択時には旧 Preview / Export がクリアされる
- **AC-003 (FR-015..FR-020, FR-032)**: 代表的な全 Index を mesh 検証と一般的なスライサーで検査し、各成功結果が単一 watertight solid と認識され、共有境界座標が一致する
- **AC-004 (FR-021..FR-025)**: 上下穴、スタンド、非ゼロ穴回転、outward / inward、flip、pad / stretch、テクスチャ有無の組合せでも、ローカル分割境界が穴・スタンドと一体回転し、選択パーツの位置・厚み・開口・テクスチャが未分割モデルの同じ最終領域と一致する
- **AC-005 (FR-026)**: 1×1 / Index 1 の回帰 fixture で、geometry 属性、index、group、集計値、Preview、および binary STL の比較が完全一致する
- **AC-006 (FR-027, FR-030)**: 小数、0、セグメント数超過、Index 超過、旧保存値を使った検証で、暗黙補正なしに対象フィールドのエラーと Build 無効状態を確認できる
- **AC-007 (FR-029..FR-031)**: 3×2 / Index 5 を保存して再読み込みすると設定だけが復元され、画像未選択・Preview 空・Export 無効から開始する
- **AC-008 (FR-033..FR-034)**: 選択パーツを Preview で回転・ズームでき、Build / Export 中に画像や geometry を送信するネットワークリクエストが発生しない

### Key Entities *(include if feature involves data)*

- **Split Settings**: `horizontalSplitCount`、`verticalSplitCount`、`splitIndex`。編集値として保存され、Build 成功時のスナップショットが生成結果へ結び付く
- **Split Cell**: 行・列、穴回転前のローカル `splitU` / `splitV` 範囲、割当てセグメント範囲で一意に定義される選択領域
- **Built Part**: Build 時の画像・作業用テクスチャ・全パラメータ・Split Settings のスナップショットから生成された、Preview と Export が共有する単一の watertight geometry
- **Split Boundary Wall**: 選択セルの切断輪郭で外面と内面をつなぎ、隣接パーツと同じ座標面を持つ閉鎖面
- **Export File**: Built Part だけを含むクライアント生成の binary STL

## MVP Scope

### Required for MVP

- 3つの分割入力、規定のデフォルト・範囲・1-based Index・行優先順
- セグメント境界に基づく決定的な割当てと、割り切れない場合の余り配分
- 選択パーツだけの Build / Preview と、表示中パーツだけの STL Export
- watertight な分割壁、共有境界の幾何学的一致、人工的な隙間なしの再組立て
- 現行の上下穴、スタンド、穴回転、厚み方向、画像変換、テクスチャ、セグメント設定との共存
- 1×1 / Index 1 の完全な後方互換、入力検証、ローカル設定の移行・復元

### Optional Future Behavior (not required for MVP)

- ダボ、キー、蟻継ぎ、スナップ等の接続・位置合わせ機構
- プリンター収縮、鋸しろ、接着剤を考慮したクリアランス・公差・境界オフセット
- 全 Index の一括生成、batch export、ZIP ダウンロード、キュー・進捗管理
- パーツ番号、行列番号、向きマークの彫刻・エンボス・ラベル表示
- 手動境界、半球専用モード、任意曲線、平面カット等の別分割方式

### Out of Scope

- 接続機構、公差、一括 ZIP、彫刻ラベルの MVP への追加
- スライサー設定、サポート材、自動配置、造形方向、プリンター固有の最小肉厚の最適化
- 複数パーツを同時に Preview する組立てモード、パーツの移動・整列 UI
- STL 以外の 3D 形式、色・テクスチャを含むエクスポート
- サーバー保存、クラウド生成、共有 URL、公開 / ネットワーク API、ユーザーアカウント

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 新規利用・旧保存データの双方で初期値が 1×1 / Index 1 となり、代表 fixture すべてで機能追加前と geometry 属性・index・group・頂点数・三角形数・binary STL が完全一致する
- **SC-002**: holeLatitude = 0、holeLongitude = 0 の方向マーカー付き作業用画像の 2×2 および 3×2 分割で、全 Index が規定の行優先ローカル分割 UV 領域へ100%正しく対応する
- **SC-003**: `10×5 segments / 3×2 splits`、`11×7 / 4×3` を含む少なくとも5件の非可除組合せで、全セグメントがちょうど1セルへ割り当てられ、欠落・外面重複が0件である
- **SC-004**: 少なくとも 2×2、3×2、4×3 の全パーツについて、隣接境界の対応頂点座標が生成 geometry 上で完全一致し、STL 再読込後の最大境界差が `0.00001 mm` 以下である
- **SC-005**: 上下穴、スタンド、穴回転、outward / inward、極・継ぎ目を含む少なくとも20パーツの検証セットで、成功した各 STL が一般的なスライサーに単一 watertight solid として修復なしで読み込まれる
- **SC-006**: 各 Export について、STL の三角形数と座標集合が表示中 Built Part と一致し、選択外パーツの三角形混入が0件である
- **SC-007**: 無効値の表（0、負数、小数、動的上限超過、Index 超過）を100%検出して Build をブロックし、3×2 / Index 5 の保存・再読み込みおよび旧保存データ移行が期待値どおりになる
- **SC-008**: デフォルト 256×128 セグメントの選択パーツ生成は、4096×2048 入力を使う現行デスクトップブラウザ・一般的な消費者向けハードウェアで30秒以内に完了し、処理失敗時もページ再読み込みなしで再操作できる

## Assumptions

- 現行バリデーションを満たし、未分割時に正の体積を持つ watertight solid を生成できる画像・パラメータを通常入力とする。分割によって選択セルが空または非連結になる例外は FR-032 の回復可能エラーで扱う
- 単位、モデル原点、座標軸、STL の向きは現行どおりとし、単位は millimeter とする
- 「再組立て可能」はデジタル形状上の境界一致を意味する。実プリンターの寸法誤差・材料収縮・接着方法は保証対象外である
- STL は geometry のみを保持し、Preview の grayscale texture、material、light、animation は含まない
- 設定はブラウザのローカル設定に保存するが、ユーザーが選択した File と生成 geometry は永続化しない
- 本アプリは単一ユーザー向け client-only Web アプリであり、画像・geometry をネットワークへ送信しない

## MVP Completion Checklist

- [ ] **MVP-001**: 3つの分割パラメータ名、UI label、デフォルト、動的範囲が仕様どおりである
- [ ] **MVP-002**: Split Index が 1-based の行優先順で、穴回転前のローカル南側行・`splitU=0` 側列から決定的に対応する
- [ ] **MVP-003**: 非可除セグメントの商・余り配分と境界 `splitU` / `splitV` が仕様どおりである
- [ ] **MVP-004**: Build が押下時スナップショットから選択パーツだけを生成・表示する
- [ ] **MVP-005**: 未 Build の設定変更で Preview が変わらず、次の Build 開始時または新画像選択時に旧結果がクリアされ、成功時に置き換わる
- [ ] **MVP-006**: Export STL が表示中 Built Part と同じ geometry だけを出力し、規定ファイル名を使う
- [ ] **MVP-007**: 各パーツが正の体積を持つ単一の watertight solid で、開いた面・非多様体・縮退面がない
- [ ] **MVP-008**: 新しい分割壁が実際の内外面を接続し、隣接パーツの共有境界座標が一致する
- [ ] **MVP-009**: 全 Index の再配置で未分割モデルとの人工的な隙間・オフセットがない
- [ ] **MVP-010**: 上穴・下穴・スタンド・穴内腔を保持し、境界交差時も閉ソリッドになる
- [ ] **MVP-011**: holeLatitude / holeLongitude によりローカル分割グリッド・穴・スタンド・分割壁が一体回転し、画像方向が固定される相互作用が FR-021 どおりである
- [ ] **MVP-012**: outward / inward、brightness / contrast / minCos の厚み結果が未分割モデルの同じ領域と一致する
- [ ] **MVP-013**: imageScale、flip、pad / stretch、texture の UV と向きが全パーツで一致する
- [ ] **MVP-014**: Width / Height segments の動的上限、ローカル極、`splitU=0/1` seam、1セグメント幅セルを検証済みである
- [ ] **MVP-015**: 1×1 / Index 1 が追加壁なしで geometry・Preview・binary STL の完全回帰を通過する
- [ ] **MVP-016**: 無効入力、空・非連結セル、生成失敗で明確なエラーを表示し、不正 Build / Export を防ぐ
- [ ] **MVP-017**: 分割設定の保存・再読み込み・旧データ補完と、File / geometry 非永続化を検証済みである
- [ ] **MVP-018**: Preview の回転・ズーム・照明・アニメーションと client-only / no-network の制約を維持する
