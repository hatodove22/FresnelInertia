# FW物理モデルのパラメトリック設計考察

調査日: 2026-09-06。対象: 作業ツリーの coherent AtomS3 FW、二つの接触面傾斜、四つの振動出力、共有状態を表示するWebクライアント。

本稿の目的は、**少ない状態と計算で、内容物の違いを動作に応じて読み取れるモデルを設計すること**。実装監査、一次研究、数式による検算から候補を比較した。コード変更・書込み・実機駆動・新しい知覚試験は行っていない。以下の「提案」「候補値」は未実装・未評価であり、今後の全項目実装を要求するものではない。実装の事実は[16](../16_PROGRESS_STATUS.md)、現在のパラメータ契約は[06](../06_PARAMETER_MODEL.md)、唯一の作業計画は[08](../08_IMPLEMENTATION_PLAN.md)が所有する。

## 1. 到達目標と設計上の結論

忠実度は粒子数や波形の複雑さではなく、次の四点で評価する。

1. **因果性**: 持ち方を変える→内容物が移る→接触する→収束する、という順序・方向・時間が両出力と表示で一致する。
2. **物性の弁別**: 質量、自由に動く度合い、接触の硬さ、粒の細かさ、流れの持続が、単なる強弱以外の手掛かりで分かる。
3. **予測可能性**: 寸法・量・材質を変えた効果を説明でき、停止・往復・再接触でも矛盾が少ない。
4. **実行可能性**: 固定容量・有限の処理時間で動き、基準条件、Stop、出力制限、デバイスの状態所有を保つ。

推奨する骨格は既存の **Mass Motion → Event → Texture → Resonance → Spatial4** と並列tiltを維持する。Massを「全材料が同じ質点」という制約から少し広げ、Eventに物理的な接触情報、Textureに微細な接触の生成則、Resonanceに仮想物体の応答を持たせる。装置の周波数補正は仮想物体の共振と区別する。

最初に詰める価値が高いのは、(a)有効パラメータと質量の意味、(b)接触・発音時刻、(c)力積と接触時間、(d)粒体の停止／崩落、(e)液体の平衡形状と揺動。多数粒子のDEM、全面的なSPH/PBF、ニューラル波形生成、精密な空間逆フィルタは、その先に具体的な不足が出た場合の候補とする。

本機の「重さ」は接触面の変形による表現であり、実際に容器の重量や手首にかかる負荷を増加させるものではない。また、四つの電気的出力が四地点の知覚的独立性を保証するわけではない。

## 2. 現行FWの監査: 何を再利用し、何を区別するか

以下の位置は調査時点のソース。既存デモの良否を再判定する表ではなく、モデルと調整操作の適用範囲を示す。

| 対象 | 実装から確認できたこと | 設計上の含意 |
|---|---|---|
| 内容物状態 | [Types.hpp](../../include/haptics/Types.hpp) の `MassState` は単一のbody x/y位置・速度、壁接触度、反発前速度、activity | 液体自由表面・独立粒子・堆積状態は別に必要。`energy`はJ単位の機械エネルギーではない |
| 運動 | [MassMotionLayer.cpp](../../src/MassMotionLayer.cpp) `updateCoherent`、319行以降。比力を9.80665と半寸法で換算。液体はばね、Hybridはその0.4倍、粒体等は中心ばねなし | 単位を持つ駆動は実装済み。静止摩擦・転がり慣性・浮力・回転座標系の項はない |
| 接触 | 同427行以降。支持中は静止、壁通過時の反発前速度を保存。0.035 m/s未満の接触はimpactにしない | 「接触しているだけで再度叩く」旧方式に戻さない。閾値未満の連続接触は別表現にできる |
| 流動 | [EventLayer.cpp](../../src/EventLayer.cpp) 718行以降。接線速度×接触度を空間間隔で割り、最大45 Hz。最大駆動の一壁を選ぶ | 距離依存は再利用できる。角の壁切替で位相が消える、複数接触を一壁に縮約する限界がある |
| 少数硬粒子 | `Granular && particle_count <= .10 && hardness >= .80` | この境界でdrag・間隔・atom・量ゲインが切り替わる。連続した粒数スライダとは意味が異なる |
| イベント時刻 | `HapticEvent`に発生時刻・接触IDがなく、[HapticSynthesisCore.cpp](../../src/HapticSynthesisCore.cpp)でサブステップのイベントを外側フレームへ集約 | 細かい物理積分をしても発音の間隔まで保持されるわけではない |
| 合成 | [TextureLayer.cpp](../../src/TextureLayer.cpp)、[ResonanceLayer.cpp](../../src/ResonanceLayer.cpp)、[AudioOutput4Ch.cpp](../../src/AudioOutput4Ch.cpp)。包絡・AM・二キャリア・白色雑音 | `Resonance`という名前でも、現状は材料モードの振動方程式を解く共振器ではない |
| 空間 | [SpatialRenderer4.cpp](../../src/SpatialRenderer4.cpp) 102行以降。主壁・近傍・対向への配分と遅延包絡 | `wall_softmax_delta`はsoftmax関数の温度ではなく主壁重みへの加算。正規化速度による方向比は非正方形で物理速度と異なる |
| tilt | [TiltPseudoForceModel.cpp](../../src/TiltPseudoForceModel.cpp) 62–239行。材料係数でCGを縮小し、shellと合成。共通位置cue・慣性・差動torqueを一括制限・平滑化 | 動的CGはすでに存在する。物理CGと知覚用の縮小、基準角と補正角を整理する対象 |
| 時間 | nominal 250 Hz。coherent内部刻みは最大2 ms。audioは240 samples/48 kHz＝5 ms/submit、DMA12本 | 250 Hz・100 Hzは実測周期ではない。60 msはDMAの名目容量で、実測遅延ではない |
| 容量 | Texture 16 voice満杯では先頭を上書き、Spatial遅延16枠満杯ではdrop | 音量を上げる前に、イベント消失・voice steal・clippingの計測候補を用意する |
| 設定 | 再configureは運動・イベント等の状態をリセット。[core契約](30_REUSABLE_FIRMWARE_CORE.md)参照 | 現在の停止中一括反映→applied確認→Startを使う。スライダ送信頻度を動力学へ混入させない |

### 2.1 調整しても期待する効果が出ない項目

これは **coherent経路＋現as-built DXL2 Position Mode 3** の監査結果。legacy、診断、別backendでは適用範囲が違う。フィールドの削除や機能フラグの無効化を勧めているわけではない。

| 項目 | この条件での適用範囲 |
|---|---|
| `event.*` の全パラメータ | coherentイベント式で未使用。頻度・thresholdスライダとして出しても衝突を調整できない |
| `container.enable_roof_contact` | coherentでは未使用。`RoofSlap`・`Scrape`はcoherentで生成されない |
| `mass.natural_freq_*` | Liquid/Hybridのばねに有効。Granularのmarbleでは無効 |
| `mass.rebound` | Liquid/Hybridは固定反発値のため無効。それ以外では有効 |
| `mass.accel_to_energy_gain/gyro_to_energy_gain` | coherentでは未使用 |
| `motion_activity.*` | coherent Massはactivity sampleを使わない。欠測・時刻境界を扱う機能自体は働いている |
| `mass.energy_decay_s` | activityの表示尾に作用。energyから計算する電流intentは現DXL2で使用されず、通常の物理出力ゲインにはならない |
| `texture.wet_burst_ms/scrape_noise_ms` | 前者はcoherent DropletClusterでは未使用、後者はScrape非生成のため通常の効果なし |
| `tilt.command_deadband_deg` | coherentはこのhard deadbandを使わない |
| `tilt.max_current_ma`とenergy由来effort | [TiltPlaneServoInterface.cpp](../../src/TiltPlaneServoInterface.cpp)の現DXL2経路はGoal Positionを送る。計算された電流intentは強度調整にならない |

また、C++にある→preset JSONで読める→dongleから書ける→applied値が返る、は別の条件である。[PresetStore.cpp](../../src/PresetStore.cpp)の部分overlayを含め、studioには `active_in_model / writable_via_transport / applied_readback / unit / reset_policy` を持つ能力表を提案する。未知のフィールドや未対応モデルを黙って受け入れない。

### 2.2 数式から分かる意味のずれ

単一marble built-inは `content_mass_full_kg=.010`、`fill=.04`。tiltが使う有効質量は **0.4 g** であり、「10 gの玉」とは一致しない。一方、振動の量ゲインはsparseで `sqrt(fill/.04)`、他では `sqrt(fill/.35)` を基準にする。この違いは意図された知覚調整かもしれないが、物理質量と呼んで同時最適化すると意味を失う。

同じfill=.04、hardness=1で `particle_count`を.10の直下から直上へ変えると、基礎dragは1.4→約3.6 s⁻¹、接触間隔は18→約5.65 mm、量ゲインは1→約.338へ変わる。これはソースから分かる不連続であり、体感上の不具合はまだ測定していない。物理的なモデル選択を明示するか、知覚的population軸を滑らかにするかを先に決める。

marble標準値では、内容CGのx変位上限は7.5 mm、shell合成後は約0.041 mm、common位置baseは最大0.8°になる。これらは各式の**単独の計算値**で、合成後の角度や知覚強度の実測値ではない。現在の有用な刺激を保ったまま、意味を変える移行は別model versionで行う。

## 3. 内容物のプロパティをどう表現するか

### 3.1 著者が指定する値、導出値、状態、提示ゲインを分ける

推奨するデータ構造は次の五群。これは概念スキーマであり、現行のwire packetへ全項目を追加する提案ではない。

| 群 | 例 | 所有・更新 |
|---|---|---|
| 内容物・容器の記述 | 密度、量、形状、粒径、材質、容器壁材、内面粗さ | preset/applicationが指定。SI単位か無次元かを明示 |
| 解決済みモデル係数 | 有効質量、転動慣性比、モード周波数・減衰、接触対係数、計算粒子数 | FWのresolverが記述から導出。導出値とoverrideを区別 |
| 時々刻々の状態 | 位置、速度、接触、液面mode、移動粒割合、残量、付着・離脱、乱数seed | AtomS3が進める。presetの固定プロパティとして扱わない |
| 知覚用の提示設定 | 衝突の圧縮指数、硬さの強調、傾斜の質量cue gain、空間spread | 物性を変えずに表現を調整。比較・保存対象 |
| 装置・セッション | ch応答、取り付け方向、サーボhome、伝達遅れ、現在の出力bounds | 機器校正とruntimeが所有。material presetで上書きしない |

「粘性=.7」を物理量とするなら、Pa·sの**粘度（動的粘度）η**、またはm²/sの**動粘度ν=η/ρ**のどちらかを指定する。現 `viscosity` は無次元の粘りパラメータであり、どちらでもない。未校正の段階ではそのまま「粘り」と呼び、物理単位を後付けしない。

「硬さ」も一変数にはしない。静的コンプライアンス、衝突の接触時間、反発、素材の共振、粗さを分ける。ユーザー向けの丸い／鋭い等の軸は、そのうち少数を連動させる**明示した写像**とする。抽象的な見た目を変えても物理容器形状を暗黙に変えない。

### 3.2 検討対象となるパラメータの全体像

「先」は現在のtuningの意味整理、「次」は最初の材質モデル候補、「後」は必要な現象が選ばれた場合を意味する。全項目をUIに並べる意図はない。

| 群 | 記述したいパラメータ | 主な効果・独立性 | 時期 |
|---|---|---|---|
| 内部幾何 | 内寸m、形状、角半径、壁normal、底の曲率、蓋・開口・隔壁 | travel、衝突順序、支持、自由表面。描画形状と同じ幾何を使う | 先/次 |
| 量 | 液体体積m³、bulk fill、整数個数、残量 | mass・headspace・contact populationを導出。意味の違うfillを混ぜない | 先 |
| 密度・分布 | ρ kg/m³、充填率φ、粒径分布、球/円板/不定形、mass fractions | 同量での質量差、慣性、接触密度。粒数proxyから独立 | 先/次 |
| 剛体運動 | 質量、半径、I/(mr²)、姿勢、転がり抵抗 | 到達時間、転がり/滑り、コインの向き | 次 |
| 摩擦 | 静止μs、動摩擦μk、転がり抵抗、必要ならStribeck速度 | 動き始め、止まり方、stick-slip。粘性dragとの違いを維持 | 次 |
| 法線接触 | e、接触時間s、必要なら有効弾性E*・減衰・形状半径 | impulse、跳ね返り、attackと帯域。容器と内容物の接触対で定義 | 先/次 |
| 液体 | η/νまたは粘り、mode数・参加率・減衰、液面高 | 揺動、遅れ、収束。量と周波数を独立の自由ノブにしない | 次 |
| 液体の非線形 | 波高限界、濡れ、表面張力、飛沫閾、蓋接触 | 壁面流・飛沫・ほぼ満杯の挙動。線形modeの適用外を補う | 後 |
| 粒体バルク | 崩落開始角・停止角、移動粒割合、移流時間、圧密/解放 | 支持→崩落→再堆積、履歴。密な砂と少数玉を区別 | 次 |
| 粒体微細接触 | 有効個数、粒径・硬さ分布、衝突間隔CV、群発長 | カラカラ、サラサラ、間欠的崩れ。実粒数と計算声部数は別 | 次 |
| 混合物 | 成分質量/体積、浮力、相対drag、流体による衝突減衰 | 氷が液体より遅れる、浮く、濡れた衝突 | 後 |
| 付着・塑性 | 付着力N、破断energy J、yield、緩和時間s | 貼り付く→剥がれる、粘土/ゲル。高dragだけでは履歴が出ない | 次/後 |
| 接触面粗さ | 高さm、相関長m、周期m、異方性、surface seed | roughness amplitudeと粒の細かさを分離 | 次 |
| 容器/物体共振 | mode周波数Hz、減衰s⁻¹/Q、位置結合、放射/触覚伝達 | 同じ衝突でも殻材と内容物で異なるring-down | 次 |
| 知覚の強調 | 圧縮指数、閾上の強調、低/高域比、event salience | 表現の読みやすさ。物性の同定値とは別 | 先 |
| 空間・時間 | spread、neighbor gain、SOA、持続時間、ch delay | 接触位置、仮現運動、時間整合 | 先/次 |
| tilt写像 | grasp原点、基準角、位置/common/torque gain、nominal grip | 重量・重心・慣性の手掛かり。機械方向変換は最後に一度 | 先 |
| 装置補正 | ch帯域・gain・crosstalk、サーボ応答・遊び | 機器差をmaterialへ吸収させない | 先、詳細は後 |
| 数値設定 | dt上限、contact許容差、voice上限、seed、LOD | 実時間性と再現性。材質プロパティとして公開しない | 先 |

温冷感、実際の剛性・押し込み抵抗、把持圧に応じた変形は、現在の出力と入力では独立に再現できない。材料の表示メタデータにはできるが、温度・硬さセンサや新機構なしに「その物性を物理提示する」とはしない。

### 3.3 量・fill・massを解決する規則

閉じた空間の幾何体積をVとした候補式:

```text
液体:       m = rho_liquid * V_liquid,       fill = V_liquid / V
粒体bulk:  m = rho_grain * packing * V_bulk, fill_bulk = V_bulk / V
個別剛体:  m = sum_i rho_i * volume(shape_i), fill_solid = sum_i volume_i / V
混合物:    m = sum_i m_i,                    w_i = m_i / m, sum_i w_i = 1
```

粒体の空隙を液体が埋める場合、bulk体積と液体体積を単純加算してheadspaceを出すと二重計数になる。氷の浮上なら排水体積も変わる。混合物は成分のmass fraction `w_i` とvolume fractionを区別し、旧17の `rho_r/rho_l/rho_g` を密度と混同しない。

物理モードでは量からheadspaceを導出する。現行独立fill/headspaceは互換入力として保持し、「headspace overrideを持つ知覚モデル」として区別する。既存preset値を勝手に修正して受容済み触感を変えない。単一玉ならmassとradiusまたはdensityの整合を取り、玉の個数をfillスライダで連続増減させない。

## 4. 運動入力と幾何: 高忠実度の前提

### 4.1 比力、重力、回転の項

座標は[04](../04_HARDWARE_AND_PIN_SPEC.md)に従い、+xは親指→示指、+yは上、計算用+zは手首方向。現行coherentの `-accel_g * g` は、IMUとモデル原点が一致し回転項を無視するなら、内容物に働く有効加速度 `g−a_origin` に対応する。この経路へさらに重力を加えると二重計数になる。

Rをbody→world回転、IMUのSI比力を `s=Rᵀ(a_IMU−g)` と定義する。原点OからIMUへのbody固定ベクトルをrIとすれば、原点比力は `sO=s−α×rI−ω×(ω×rI)`。内容物の原点相対座標rについて、body座標系で:

```text
r_ddot = -sO - alpha cross r - omega cross (omega cross r)
         - 2 * omega cross r_dot + F_non_gravity / m
```

これはNewton則と[回転座標の加速度関係（MIT Dynamics講義）](https://ocw.mit.edu/courses/16-07-dynamics-fall-2009/resources/mit16_07f09_lec08/)からの整理であり、現FWへの追加は未実装。Fには壁接触・摩擦・モデル内の粘性抵抗や結合ばね等の非重力の力を含める。ωはrad/s、αはrad/s²。x/yモデルなら最初はgyro zによる面内回転だけを候補にする。全gyroを使っても、3Dの状態・接触・空間出力がないまま3D化とは呼べない。αの数値微分は雑音を増やすため、回転項が代表gestureで効くかを先にオフライン比較する。

加速度のLPFを重力、残差を線形加速度とする現tiltの分離は近似である。速い傾きと並進は分離しきれない。姿勢にはgyro融合と重力観測の信頼度を使う候補があるが、IMUのみで絶対位置・絶対yaw・持続並進と重力を完全に識別することはできない。

### 4.2 幾何モデルの選択

| 方法 | 計算の性格 | 表せること・失うこと |
|---|---|---|
| 現x/y矩形質点 | O(1) | 最小コスト。有限玉径、曲面、蓋開口は表せない |
| 矩形＋有限半径 | O(1) | 玉中心の限界を `half_span−radius` に。移動可能距離の意味が明確 |
| 円/カプセル/丸角矩形の解析距離・法線 | O(1) | 連続normal、転がる底、滑らかな角。最初の形状拡張向き |
| 小さな凸多角形 | O(辺数×代表物体数) | 傾斜底、異形容器、液体の面積拘束にも再利用 |
| メッシュ/SDF格子 | 面数/格子と接触点数に依存 | 複雑形状に対応。補間・メモリ・normal連続性が必要 |

SDFを使うなら符号を固定する。例えば「内部で正」の壁までの距離dに対し、球の許容域は `d(r)≥radius`、接触は `d(r)=radius`。衝突normalはforceの方向と接近速度の符号を一組で定義する。壁の縁・角では二接触をまとめて処理し、二つの完全な衝突energyを無条件に発生させない。

open containerでは上端を常に反発壁にせず、離脱・流出が起こる場合に残量とCGを更新する。ただしこれは[atlas](32_INTERACTION_DESIGN_SPACE.md)のoutflow候補に相当し、現段階で全素材の必須機能にしない。

## 5. 内容物の動力学: 軽量モデルの比較

### 5.1 少数剛体: 「玉」「コイン」「角片」を区別する

最初は1個、必要なとき2～8個程度の代表剛体を候補とする。これは処理予算を見積もるための案で、最適粒子数ではない。粒径で壁までの実移動距離を変え、静止摩擦、反発、回転慣性を分離する。

| 方法 | 強み | 限界/選び方 |
|---|---|---|
| 点質量＋drag＋反発 | 現行に近く安定 | 転がりと滑りの到達時間・停止条件を区別できない |
| 有限球＋転動慣性係数 | 少数状態で玉らしさを追加 | 純転がり成立には静止摩擦条件が必要 |
| 姿勢を持つ2D剛体＋接触impulse | コイン、角片、転倒、複数点接触 | 回転・接触solver・姿勢依存の合成が必要 |
| 少数代表粒子＋統計細部 | 個々の大粒と細粒の背景を両立 | 代表粒子に全質量を均等割当すると巨大粒の衝突になり得る |
| 全粒子DEM | 接触網・詰まり・粒子間衝突 | 計算は粒子/接触数に依存。AtomS3での余裕は未測定 |

無滑りで斜面を転がる場合 `a_t = g sin(theta)/(1+I/(mr²))`。一様実体球ならI/(mr²)=2/5。無抵抗の点質量が10°の斜面を60 mm移動する理想値は0.265 s、純転がり球は0.314 s（同距離・初速0）。これは解析検算であり現FWの再現試験ではない。**転がりの音色だけを変えるより、到達時刻も変えるべき理由**になる。

反発係数eは接触対と速度で変わり得る。最初は固定e＋低速停止、必要なら滑らかなe(v)にする。大きな弾性ばねを粗いdtで積分するより、法線impulseと非貫通拘束を用いる方が少数剛体には扱いやすい。ばね接触は柔らかい粒や接触時間そのものをモデル化する場合に選ぶ。

### 5.2 液体: 平衡形状と揺動を分ける

推奨候補は **体積拘束のある平衡液面・CG＋接線方向1～2個のconvective mode＋条件付き壁面流/飛沫**。最初は固定した平衡姿勢周りの小振幅で比較し、動く平衡点・基底へ広げる場合の整合条件を別に扱う。現単一質点の位置をそのまま全液体のCGにするより、満杯へ近づくと可動液面とCG変動が減ることを表しやすい。

矩形容器の小振幅・非粘性・重力支配の一次横揺れについて、`k=pi/L`、`omega²=g k tanh(k h)`。Lは水平の内幅、hは液深で、`f=omega/(2pi)`。[NASA SP-106, §2.2](https://ntrs.nasa.gov/api/citations/19670006555/downloads/19670006555.pdf)の式2.13を確認した。この近似からの計算例は以下。粘性・砕波・大傾斜・蓋接触は含まない。

| L | h | 理想一次周波数 |
|---|---|---|
| 60 mm | 21 mm | 3.226 Hz |
| 120 mm | 42 mm | 2.281 Hz |
| 60 mm | 6 mm | 1.989 Hz |
| 60 mm | 48 mm | 3.583 Hz |

同じ形の拡大では概ねL⁻¹ᐟ²、浅い充填ではtanh項も効く。物理モードでは寸法を変えても固有周波数を固定するのではなく、幾何から初期値を解決し、未モデル化損失を減衰へ合わせる。これらの数値を現presetの正解値とはしない。

本機のbody yは上向きであり、x/yを二つの水平slosh軸として同じ式に代入してはいけない。まずx/y断面内で準静的な下向きと液面接線を定め、占有面積×奥行きを保って平衡CGを求める。準静的な上向きuを比力から定めるなら `u=sO_qs/|sO_qs|`。多角形の内部で `u dot r <= h` の領域を切り出し、その面積が液量と一致するようにhを決めると、平衡CGを面積重心から計算できる。mode変位から壁面高とCGへの係数を同じ体積モデルで導出する。垂直加振は単なる独立yばねより、有効重力・波高・飛沫条件への作用として扱う候補になる。

```text
固定平衡sO_ref、固定接線b、delta_sO=sO-sO_refの小振幅モデル:
q_j_ddot + 2*zeta_j*omega_j*q_j_dot + omega_j²*q_j = -Gamma_j * dot(b, delta_sO)
content_CG = equilibrium_CG + sum_j a_j*b*q_j
surface_height(xi) = equilibrium_surface(xi) + sum_j phi_j(xi)*q_j
```

qは長さとして定義する例、aは無次元のCG参加係数、Γは励振参加係数、φは液面mode形状。自由表面変位とCG変位は同じ量ではない。屋根接触はCGの壁到達ではなく、液面の壁/屋根到達から判断する。fill=0/1では自由表面modeを消し、満液の質量反力は残す。

広い姿勢変化に対して `c=c_eq(t)+B(t)q` とするなら、加速度には `c_eq_ddot + B*q_ddot + 2*B_dot*q_dot + B_ddot*q` が現れる。平衡CGだけ更新してqを残す方式は偽の加速度を作り得る。準静的平衡とmode双方へ同じ傾きを入れて静的応答を二重計数したり、基底を瞬時比力に垂直にして励振を消したりしない。基底変更時の状態transportは次段階の実装・検証課題である。

| 方法 | 向く場面 | 限界 |
|---|---|---|
| 現ばね＋drag質点 | 最小の比較基準 | 自由表面・体積・満杯付近の意味が弱い |
| 固定基底の1～2モード | 小さな傾き、一定形状 | 大きな回転・砕波で線形近似が破れる |
| 体積拘束＋姿勢別mode/LUT | 大きめの傾きでも含まれて見える | 基底変更で状態/energyを連続に移す工夫が必要 |
| 等価振り子 | 大角度のmodeを幾何で表せる | 任意の壁圧・飛沫・自由表面を表すものではない |
| 粗い浅水格子 | 波の伝播、壁到達、浅い流れ | ひっくり返し、深水、分離飛沫には別処理 |
| SPH/PBF | 大変形、流出、分裂の明示 | 近傍探索・密度制約の反復・境界処理が必要 |

[Macklin & Müller, Position Based Fluids (2013)](https://mmacklin.com/pbf_sig_preprint.pdf)は密度拘束を位置で反復解決する手法であり、安定性と非圧縮性の計算を取引できる。ただしGPUでの実時間性はAtomS3での実行可能性の証拠にならない。本機では当面、ホスト上の参照生成や縮約係数の作成に使う方が価値が高いという判断である。

表面張力・接触角・粘弾性・降伏応力は追加候補だが、線形粘性一軸で全てを代用しない。強い揺すりやほぼ無重量で準静的液面の基準が定まらない場合は、そのモデルの適用外として扱う。瞬間比力へ液面基底を高速追従させると、揺動の遅れを消してしまう。

### 5.3 粒体: 数より「止まる・崩れる・残る」

砂を一つの高drag質点にすると、微小な傾きでも流れ続け、堆積の記憶がない。最小の追加状態は、堆積の傾き、移動中の質量割合χ、移動重心/速度、崩落中かどうか。`theta_start > theta_stop` の二閾値で停止と流動の履歴を表す候補がある。

静止粒と移動粒の交換を分ける考え方は[BCRE系の原著、Bouchaud et al. (1995)](https://journals.aps.org/prl/abstract/10.1103/PhysRevLett.74.1982)に根拠がある。ここで提案する有限状態のχモデルはそのPDEそのものでも、パラメータ同定済みの砂モデルでもない。[Mahadevan & Pomeau (1999)](https://softmath.seas.harvard.edu/wp-content/uploads/2019/10/pre2000-07.pdf)も移動層と静止層の質量交換を扱う。

```text
静止中: slope_drive > theta_start で流動へ
流動中: slope_drive < theta_stop かつ速度低下で堆積へ
chi_dot = mobilization(slope, agitation)*(1-chi) - settling(slope, speed)*chi
m_moving = chi*m_total, m_static = (1-chi)*m_total
```

傾斜の正負が変わっても新しい堆積形状を維持し、質量交換時には両群の位置・運動量の扱いを定義する。移動群だけからflowイベントを生成し、静止群の荷重はtiltへ寄与させる。内部の小さな衝突は統計表現、大きな壁到達・崩落開始は明示イベントにする。

少数玉には個別運動、密な砂にはχ＋統計micro-contact、その中間には少数代表粒子＋背景、という**状態の選択**が重要。全てを同じparticle_count proxyで補間するより説明しやすい。高度な詰まり・力鎖・粒径による分級まで必要ならDEM/連続体へ進むが、今回の触感に必要かを先に比較する。

### 5.4 混合物・付着物・柔らかい物

現Hybridは同じ接触から乾いた成分とwet成分を重ねる。氷水として詰めるなら液体modeと氷の位置/速度を分け、相対dragを結合する。氷へ加えたdragの反力は流体側にも反映し、共通の総質量・CG・接触台帳を使う。浮力は密度比と浸漬量で変え、全成分のCGを重み付けする。単なるdry/wet振動crossfadeは材質の混合表現には使えるが、相対運動の実装ではない。

付着は `Free / Attached / Releasing` と保持位置、離脱閾、履歴を持たせる。高dragとの差は「止まっている位置」「解放時の過渡」「解放後の自由な移動」。既存[08](../08_IMPLEMENTATION_PLAN.md)のattachment候補と接続できる。柔らかいゲルには少数のKelvin–Voigt型変形mode、さらに緩和の違いが必要なら標準線形固体等が候補になる。実際の押し込み力は測っていないため、触感上のコンプライアンス表現と静的剛性再現を区別する。

## 6. イベントは「何が起きたか」と「どう鳴らすか」を分ける

### 6.1 接触のライフサイクル

物理側は `Begin / Persist / End` を持つcontactを更新し、意味のある状態遷移からimpact、release、avalanche onset、splashを出す。Textureが選ぶHardPing/WetBurst等は提示側のatomであり、物理イベント名ではない。たとえば同じwall impactを、接触対と励振energyに応じて硬い衝突または湿った衝突に変換する。

| 物理情報 | 使い道 |
|---|---|
| 単調な発生時刻、frame内offset、event sequence、model/config revision | substepの順序、audio sampleへの配置、表示との照合 |
| contact ID、内容物/成分ID、wall/feature ID | 接触継続の追跡、重複抑制、個々の粒の同一性 |
| 接触位置m、normal、接線、衝突前の相対速度m/s | 空間化、接触時間/強度、転がり/滑りの区別 |
| 法線impulse N·s、接線impulse、接触仕事/散逸energy J | dtに依存しないimpact励振、擦過の持続強度 |
| 接触継続時間、法線荷重N、走行距離m、接触状態 | rolling/flow/scrapeのmicro-event生成 |
| 決定的seedと連番、merge/dropの種別 | 再現比較、容量不足時の意味を追跡 |

全部を毎回無線へ送る必要はない。最小導入は**ローカルのevent時刻/offset＋ID＋接触速度またはimpulse**。持続接触の詳細はFW内固定容量で保持し、telemetryには選んだ要約・連番・状態versionを載せる。230-byte v3へ無制限に追加せず、既存wire契約と別の拡張方法を実装時に選ぶ。

### 6.2 衝突強度を物理量から作る

法線接近速度u>0、有効質量m_eff、反発eに対する摩擦なしの剛体衝突なら:

```text
J_n = m_eff * (1+e) * u
DeltaE_normal = 0.5 * m_eff * (1-e²) * u²
f_contact(t) = (J_n/tau) * w(t/tau),  integral_0^1 w(x) dx = 1
```

Jと接触時間τを分ければ、硬い接触としてτを短くしても積分した力積は増えない。一方、τを短くするとピークと高域は増え得るため、励振波形→仮想共振→装置帯域→知覚圧縮→既存出力制限、の段階を分ける。`J/dt`をそのまま振幅にすると制御周期が触感を変えてしまう。

J、入射energy、散逸energyのどれを振動へ写すかはモデル選択である。反発e=1なら上式の散逸は0だが、Jは0ではない。弾性の大きい衝突が必ず無振動ということにはならない。振動modeへ渡すenergyまで物理整合させるなら、modeへの移行と熱損失を含めて反発側と収支を合わせる。単に知覚用のimpact gainを使う段階では「energyから導いた提示量」とし、皮膚へ同じJ/energyを実現したとは主張しない。

接触の検出は、壁到達時刻を一次補間する簡単なTOI（time of impact）から比較できる。高速・細い空間では残り時間の反射積分や複数接触を必要に応じて加える。静止支持、低速の接触継続、実際の新しい衝突は別状態にし、全壁共通cooldownで異なる衝突まで消さない。

### 6.3 連続contactから微細なイベントを生成する

| 生成則 | 統計・感触の特徴 | 適用と注意 |
|---|---|---|
| 距離phase / 周期格子 | 規則的、速度に比例して頻度変化 | 溝・均一な転動。現flowの発展形。粒体全般に使うと周期的になりやすい |
| 距離のrenewal過程 | 平均間隔と間隔CVを独立に設定 | 粒径のばらつき。Gamma型間隔なら規則性を連続調整できる |
| 条件付きPoisson過程 | 不規則、平均rateだけでは群発性を表せない | 細粒の疎な衝突・泡の候補。静止時にrateを0にする |
| 群発/Cox型、状態切替型 | 崩れ始めのまとまりと静かな区間 | avalancheやsplash。外部運動と移動質量に条件付け、無原因の自己励起を防ぐ |
| 平均仕事率→filtered noise | 高密度で個別イベントを省略 | サラサラ、連続流。大きい衝突・停止端点は別に残す |

Poissonなら区間に一つ以上出る確率は `p=1−exp(−lambda*dt)`。これはイベント**数**ではない。lambda*dtが大きいときも一フレーム一個のBernoulliで代用すると密度が頭打ちになる。Poisson countまたは次イベントまでの待ち時間を使い、frame内時刻を保持する。

変動するlambdaでは、累積hazard `H=integral lambda(t)dt` と指数分布の次の閾値を持ち越す。距離renewalも累積dsと次の距離閾値を保持し、区間内の通過時刻を求める。毎frame待ち時間を引き直さず、乱数消費をframe数から独立させる。seedを固定するだけではframe分割不変性は得られない。入力・hazardの積分誤差まで完全に同一になるとは限らず、許容差を定義する。

位置に固定した粗さは符号付きsurface座標で読み、発生数を管理する移動量には `ds=|v_t|dt` を使い分ける。逆向きに戻ったとき、同じ溝や粗さが同じ位置にあることと、経過走行距離が増え続けることを混同しない。接触終了時は新規励振だけを止め、既に生じた共振の尾は自然に減衰させる。

高密度化で「粒数を増やすほど無制限に強い」ことを防ぐため、一定接触仕事率をmicro-eventへ分配する候補がある。独立な定常Poisson shot noiseで、hを共振後の一イベント波形とすると、**DCを除いたpower（分散）**は `lambda*E[A²]*integral h² dt`。非ゼロ平均なら平均二乗値には `lambda²*E[A]²*(integral h dt)²` も加わる。高密度でAC強度を一定にする補助比較ではAを概ねlambda⁻¹ᐟ²へ補正できるが、相関・群発・limiterがあると成立しない。低rateで振幅を無制限に増やさず、最終材質モデルで必要な強度変化まで消す規則にはしない。

### 6.4 容量とイベント優先度

固定poolを保ち、強い物理impact・release・始終端を優先し、微小な定常flowを同じ接触内で合算する候補を推す。voice stealは「常に先頭」より残energy/残時間/重要度を使う案がある。mergeは独立した強い衝突の時刻や壁を消さない範囲に限定する。

`generated / rendered / merged / dropped / stolen` を区別する最小カウンタがあると、最大rateやgainを上げても差が出ない理由を追える。乱数はmodelとcontactごとにseed/sequenceを持ち、フレーム分割の違いだけで別の触感にならないようにする。密度によるLOD切替では共通excitation powerと状態を引き継ぎ、微細イベントとnoiseを二重に全量加算しない。

## 7. 触感合成アルゴリズムの比較

### 7.1 最初の候補は少数mode＋接触拘束のある励振

| 方式 | 制御できる特徴 | 計算・記憶の性格 | 本機での優先度と限界 |
|---|---|---|---|
| 現二キャリア＋包絡＋noise | low/high比、時間、AM | 小さい、既存 | A基準。材質の違いが同じcarrierの強弱へ偏る可能性 |
| 減衰正弦/2-pole IIRの少数mode | 接触attack、周波数、mode別減衰、結合 | O(mode数×sample数)、小さい状態 | 最初のB。2～4modeから差を見る |
| 帯域制限noise＋接触包絡 | 粗さ、帯域、間欠性 | 少数filter | 砂・擦過の低コスト細部。単発の同一性は別event |
| 距離profile＋micro-contact | 空間周期、相関長、摩擦、離脱 | LUT/生成noise＋局所solver | 転がり・擦過向き。硬いcontactの積分安定性が課題 |
| 短いsample/grain | 湿った衝突、割れ、複雑なattack | 低計算、flash/データを使う | 実物基準やanalyticの残差に有用。速度変更とpitch変更を混同しない |
| 力/速度条件付きAR/ARMA | 定常textureのスペクトル・RMS | O(filter次数)、係数表 | 記録データがある段階で有力。周期模様や個別接触は別表現 |
| wavelet/residual dictionary | 複数時間尺度、非定常の細部 | 辞書・選択処理 | sampleより変形しやすい候補。データ整備と説明性の負担 |
| 高速micro物理の直接積分 | 弾性、接触離脱、非線形摩擦 | stiffness/刻み/接触数依存 | 必要な現象が粗視化で失われた場合に限定 |
| 学習生成器 | 複雑な条件依存・未知素材 | データと推論コスト | PCで探索・係数/sampleへ縮約する候補。MCU実行は未評価 |

[FoleyAutomatic (2001)](https://www.cs.mcgill.ca/~kry/pubs/foleyautomatic/foleyautomatic.pdf)は、運動/contact excitationと共振体を分けて衝突・転動・擦過を生成する音響研究。[Hasti (2021)](https://www.ncolonnese.com/research/Hasti/whc2021_sc_ct_nc_final.pdf)は、粗い接触からmicro-contactを再構成し、触覚と音響へ別の出力を与える。後者のmacro 60–200 Hz、micro 44.1 kHzという構成はmultirateの先例であるが、指‐表面モデルをそのまま容器へ移植する根拠ではない。

一つの減衰modeを、sample周期Ts、減衰率σ、減衰振動周波数fdで表す例:

```text
r = exp(-sigma*Ts), a = 2*r*cos(2*pi*fd*Ts)
y[n] = a*y[n-1] - r²*y[n-2] + b*x[n]
```

fdはHz、σはs⁻¹、xは接触励振、bはそのmodeへの結合と正規化を含む。係数は設定変更時に計算する。各衝突で共振状態を0へ戻さず再励振すれば、接触を重ねたring-downが残る。対象物全体のmodeと局所impact voiceを区別し、既に起きた衝突の場所を後のCG移動で動かさない。modeを増やす前に、attackと装置帯域が区別を届けているかを比較する。

連続時間のpulseを単純に点samplingすると、短いτや発生offsetによって力積が変わり、極端には励振を見落とす。x[n]をsample区間の平均力Nとして区間積分から作り `Ts*sum_n x[n]=J` を保つか、N·sの力積としてmode状態へ直接注入する。どちらを使うかでbの単位とTs依存を定義する。τや空間波長が合成帯域を超えるときは帯域制限し、安定IIRや単なる補間だけでaliasingが防げるとは考えない。

### 7.2 転がり・擦過の忠実度

空間粗さの波長ellは概ね `f=|v_t|/ell` へ写る。粗さ高さと相関長を独立にすることで、「強い」と「細かい」を分けられる。ただし、表面凹凸に質点を完全追従させると、短波長で非現実的な加速度が生じる。有限粒径による平滑化、法線荷重による追従限界、接触離脱、接触時間による帯域制限を組み合わせる。

[Agarwal et al. (2021)](https://mcdermottlab.mit.edu/papers/Agarwal_etal_2021_scraping_rolling_synthesis_DAFx.pdf)は、音響の転動/擦過合成で接触軌跡の非線形制約が有効であることを比較している。本機での触覚改善は未検証だが、位置別の細かいIRを増やすより、接触励振を正す候補を優先する判断を支持する。

単純摩擦の選択肢は、Coulomb＋静止状態、連続なtanh近似、Stribeck型、内部状態を持つbristleモデル等。tanhだけでは厳密な静止を表しにくい。高域の擦れを出すために不安定なstick-slipを物理solverへ作り込むより、低周波の摩擦仕事と接触状態から帯域制限した微細励振を生成する方が最初の比較として扱いやすい。

### 7.3 粒、液体、data-driven方式

[CookのPhISM/PhISEM (1996/1997)](https://quod.lib.umich.edu/i/icmc/bbp2372.1996.071/1/--physically-informed-sonic-modeling-phism-percussive?page=root%3Bsize%3D100%3Bview%3Dtext)と[公式STK Shakers](https://raw.githubusercontent.com/thestk/stk/master/include/Shakers.h)は、統計的接触で減衰・共振を駆動する軽量な先例。ただしその活動clockを独立に増設せず、今回のχ、接触速度、運動から渡された仕事量に条件付ける。

[van den Doel, Liquid Sounds (2005)](https://www.persianney.com/kvdoelcsubc/publications/tap05.pdf)の気泡分布・減衰振動はwet細部の候補になる。これは液体のCG・壁圧・流動そのもののモデルではない。泡の高い音響周波数を触覚帯域へ移す場合は、物理周波数の再現ではなく知覚的な符号化とする。

[Culbertson et al. (2012)](https://repository.upenn.edu/bitstreams/5f621471-2bac-420e-a3e5-7168a775a5c6/download)は、接触力・速度を条件とする加速度データからARMAを作る。均質なtextureに適し、力/速度を変えた連続補間が可能。ただし本機では法線接触荷重はモデル推定、実gripは未測定である。AR係数を直接線形補間して安定性を期待せず、LSF等の安定な表現か安定filter出力間のcrossfadeを使う候補とする。

[Heravi et al. (2024)](https://arxiv.org/abs/2212.13332)の学習型textureは将来の素材追加に関係するが、学習時の接触・装置と本機の差は大きい。初期は実物容器の接触加速度を短く収録し、代表attack・PSD・減衰を合わせる方が、公開の擦過データを物理的な砂のモデルと呼ぶより解釈しやすい。録音設備/実物比較を使う作業は今回未実施。

音から振動への移行は三案を区別する。(1)帯域内sampleを直接再生、(2)音の包絡/帯域energyで触覚carrierを変調、(3)共通contact excitationを触覚専用transferへ通す。簡便さは(1)、因果と物性の保持は(3)が有利と考える。音声と皮膚振動で同じ電圧波形を使う必要はない。

## 8. 空間化・装置応答・時間整合

### 8.1 仮想共振と実機の共振は別

仮想の「ガラス殻」「木片」「砂粒」が持つ応答と、実トランスデューサ・筐体・指の接触が持つ応答を区別する。後者を前者のmaterial gainへ埋め込むと、chやgripが変わるだけで材質が変わってしまう。

概念的には `skin_response(f) = H_device(f, grip, tilt) * drive4(f)`。Hは必ずしも4×4でなく、観測する接触位置・方向の数×4。列が似ていれば4入力でも有効な空間自由度が少ない。最初は各chの粗い帯域/等強度補正、次に相互結合の把握。逆行列を無条件に使うと、弱い方向や共振の谷へ大きな出力を要求するため、必要な場合でも正則化・帯域・出力制約を含める。

### 8.2 パンニングの選択

| 方式 | 性質 | 比較したいこと |
|---|---|---|
| 主壁のみ | 単一chへ集中。ch弁別が成立すれば単純な位置符号 | chの違いが分かるか、壁切替が不連続か |
| 振幅の和を一定に配分 | 現行に近い、同相合成向きの面がある | 中央で弱くならないか |
| powerの和を一定に配分 | `A1=A sqrt(1-beta), A2=A sqrt(beta)` | 等強度の改善候補。同相・機械結合があると一定皮膚powerにはならない |
| contact normal/距離による連続配分 | 曲面・複数接触を扱いやすい | 距離はm、速度はm/s、法線はbody座標の単位ベクトル。正規化座標の歪みを避ける |
| 時間差のある順次提示 | 移動感・流れ | SOAだけでなく包絡長・重なり・伝達差を比較 |

四chを強く混ぜれば自然になるとは限らない。衝突は場所を明瞭に、残響は広く、流れは時間を持つ移動、という役割別の配分を候補にする。音量比較の際は、spatial weight、相関、peak limiterの影響を含めて確認する。

### 8.3 時間は三つの段階で測る

1. **モデル時間**: IMU時刻、物理contact時刻、event substep offset。
2. **装置時間**: audio enqueue/実sample、サーボ指令/feedback。ホスト時刻と区別。
3. **表示時間**: telemetry受信、補間、描画。接触表示を10 Hzの到着時刻そのものへ固定しない。

現行audioは5 msブロックをsubmitし、その後servo処理が走る。writeには待ちがあり、DMAと機械応答も介在する。まず遅れ・jitterの分布を測り、モデルの粘性、傾斜filter、出力待ちのどこに原因があるかを分ける。`underrun_count=0`だけでは全ての時間整合を証明しない。

提案する高速rendererでは、event offsetをaudio sample位置に変換し、包絡・共振の位相をaudio時刻で進める。制御フレームの振幅を一ブロック保持するだけの方法と比較できる。遅延したeventを過去へ発音することはできないので、過去分を同時に詰めて再生せず、遅着を計数して因果の始終端を優先する。

表示にはdevice時刻とevent sequenceを使う補間が候補だが、connected viewで新しい衝突を独立シミュレーションしない。固定のaudio/visual遅延を加える前に総遅延との取引を評価し、Stopを同期用bufferの後ろへ待たせない。

## 9. tiltモデル: 力学の整理と知覚写像を両立する

### 9.1 現在のcueを分解してA/Bできるようにする

現行の動的CG・common位置cueをAとして保存する。B候補では、grasp原点からcontainer centerへのoffset、shell CG、content CGを同じm単位で定義する。物理CGを材料ごとに縮める代わりに、**物理CGの推定と、それを傾斜へ変換する知覚gain**を分ける。初期移行では出力を合わせ、意味整理だけでaccepted strengthを失わないようにする。

```text
theta_thumb = theta_reference_thumb + G_position*c_x + G_common*F_common + G_diff*tau_z
theta_index = theta_reference_index + G_position*c_x + G_common*F_common - G_diff*tau_z
```

これは小信号近似の提示写像の例である。θをrad、cをm、FをN、τをN·mとすれば、G_positionはrad/m、G_commonはrad/N、G_diffはrad/(N·m)。reference、common、differentialを分けるためのもので、接触角がこの線形式で物理的な力を完全再現するという意味ではない。現実装のatan・各項clamp・合成後limitとは同一でない。atanを使う場合も `atan(a+b)` と `atan(a)+atan(b)` は違うため、比較対象を明示する。motor方向変換は装置境界で一度行う。

公称gripを使う間、`atan(F_tangent/F_normal)`型の式は知覚cue設計であり、実際に測った接線/法線力の比ではない。最大角、slew、位置P、機構の遊びを一つの「重さgain」に吸収させない。合成後の二指比を保つ制限と既存Stopは維持する。

### 9.2 反力まで詰めるときの二重計上防止

CG×見かけ力は軽量な近似として有用だが、同じCGの粒体と液体でも角運動量・壁への作用点は異なる。接触から反力を得る場合、shell→contentsの外部接触力f_k、grasp→接触位置p_kから:

```text
F_contents_to_shell = -sum_k f_k
tau_contents_to_shell = -sum_k (p_k cross f_k) - sum_k contact_torque_k
```

粒子間の内力はshellへ加算しない。流体と氷のdragもまず互いの反力とする。既存の総質量慣性・CG torqueにこの反力を追加すると、内容物の荷重を二度数える可能性がある。shell自身の荷重/慣性は別成分として残す。

閉じた系・一定内容質量m・一様重力なら、全内容CG=cを使う次式を**検算用**にできる。

```text
F_contents_to_shell = -m * [sO + c_ddot + 2*omega cross c_dot
                           + alpha cross c + omega cross (omega cross c)]
```

無回転の静止支持では−m*sO、自由飛行でc_ddot=−sOなら0。接触積算方式とこの式を同時に加算しない。torqueには一般に `c cross F` だけでは足りない。高度化するときは接触wrenchまたは角運動量収支まで合わせる。

impact impulseはservoへ `J/dt` の尖った指令として流さず、単位面積kernelで低域化する候補がある。振動には短い接触、tiltには同じ原因の遅い反力を割り当てる。両者の分担周波数はservoの実応答と知覚比較で決め、固定の「何Hz以下なら必ず重量感」という境界は置かない。

## 10. 知覚を生かす錯覚と、その適用限界

目的は最大振幅ではなく、内容物の原因を少ない刺激から推定できること。下表の装置間移植は全て本機での仮説である。

| 機構 | 使い方 | 本機で最初に確かめること |
|---|---|---|
| 指腹変形による重量/慣性cue | 共通/差動傾斜の持続成分と動作依存成分を補完 | 静止と反転動作で質量差が読み取れるか。振動を強くしただけか |
| 触覚的な移動時間から隠れた長さを推定 | travel→impactを幾何と連動 | 音色を固定し、容器長の差を知覚できるか |
| 視触覚の統合 | FWと一致する内容物表示が弱い触覚の解釈を助ける | 同じFWで隠す/見せる。視覚だけの識別でないか |
| phantom/funneling | 同時の複数chで中間位置を表す候補 | 等強度で中間位置を区別できるか |
| 仮現運動 | SOAと包絡の重なりで隣接位置を移動 | 流れ、一塊、点列のどれに感じるか |
| 非対称加速度による牽引方向感 | 短い方向アクセント | 皮膚へ伝わる加速度の非対称性と方向判断が成立するか |
| onset強調・背景の抑制 | 大衝突の直前後で微細textureを整理 | 接触は明瞭になり、材料感や連続性は失われないか |
| 期待と実触感の対比 | 一つの動作で「思ったより動く/粘る」を示す | 単なる驚き/好みと自然さを分けて評価する |

[南澤ら (2008)](https://www.jstage.jst.go.jp/article/tvrsj/13/1/13_KJ00007499166/_article/-char/ja/)は指腹変形と能動運動を用いた質量・内部ダイナミクスの提示を扱う。ベルトによる剪断/圧迫装置であり、本機の一軸contact planeへゲインや弁別値を移植できない。隠れたtravelの先例は[既存文献監査S04](33_INTERACTION_RESEARCH_SOURCES.md)のVirtual Rolling Stoneを参照する。

[Ernst & Banks (2002)](https://www.nature.com/articles/415429a)の信頼度に応じた視触覚統合は高さ判断の知見で、視覚が常に支配するという法則ではない。表示で解釈を助けつつ、画面非表示での物性差も短く確認する。ただし機構音・振動音が残るため、画面を隠すだけでは触覚単独の証拠にはならない。Bouba/Kiki風の丸い／鋭いUIは同様に探索用の比喩であり、普遍的な物理パラメータ写像ではない。

[Tactile Brush (2011)](https://la.disneyresearch.com/wp-content/uploads/Tactile-Brush-Drawing-on-Skin-with-a-Tactile-Grid-Display-Paper.pdf)はfunnelingと仮現運動を使うが、原装置は背面の63 mm間隔の配列。前者は同時刺激の位置、後者は時間差を伴う移動であり別現象である。平方根weightやSOAを採用しただけで、本機の指腹/筐体上で成立したとはしない。

[Amemiya et al. (2005)](https://doi.org/10.1109/WHC.2005.146)の非対称加速度の方向感も、電圧を鋸歯状にすればよいというものではない。筐体と把持を通過した加速度波形の条件が必要。低域方向cueが既存tiltで得られているため、現在は優先度を下げる。

[Vogels (2004)](https://pubmed.ncbi.nlm.nih.gov/15151159/)の平均45 msの非同期検出値はジョイスティック衝突課題の結果。本機で45 ms以内なら必ず同期する、という仕様値にはしない。二つの出力が同じ原因と感じられるかを、遅れの分布と代表contactで確かめる。

順応・maskingを使って微細な刺激を整理する案は有望だが、常に強い背景を加えると接触を隠す可能性もある。「人の知覚を最大化」は刺激強度を上げ続ける問題ではない。

## 11. パラメータ最適化・ゲインチューニング

### 11.1 何を最適化しているかを分ける

少なくとも、物理応答の一致、材質/方向の識別、自然さ、好み、滑らかさ、計算コストは別指標である。「どちらが良いか」だけでは強い・派手な設定を選びやすく、物性の忠実度を同定したことにはならない。

`mass × tiltGain / nominalGrip`、`impulse × excitationGain × resonanceGain` のような積は、出力から各要素を独立に求めにくい。密度・量・寸法・装置gainを全て自由にして人に選ばせると、物理量が相殺用のノブになる。測れる物理値は固定し、未測定の縮約係数と知覚gainだけを明示して探索する。

### 11.2 段階別の進め方

| 段階 | 作業 | 判断材料 |
|---|---|---|
| 0 基準を固定 | accepted preset、applied値、model版、寸法/量を保存 | 変更後に同じAへ戻れる。現tuning studioは未実装 |
| 1 意味と感度 | 有効パラメータ監査、単位/依存関係、pure coreの同一入力比較 | 効かない軸、同じ効果の軸、閾値/飽和の領域 |
| 2 力学の粗い整合 | 到達時間、停止角、ring-down、量依存を対象別に照合 | 物理モデルの問題を出力gainで隠していないか |
| 3 提示系の整合 | 必要なchの等強度、遅れ、command/feedback、clip/voice消失 | 装置差と材質差を分離 |
| 4 少数軸A/B | 目的を一つにして2～4軸程度を探索 | 自然さ/硬さ/重さ等の判断と確信度 |
| 5 適応探索 | 必要な場合だけstaircaseまたは選好BO | 閾値が欲しいのか、良い設定が欲しいのかを区別 |
| 6 外挿確認 | 調整に使わなかったgesture・別の日・表示なしで短く比較 | baselineに対する改善が特定入力だけに過適合していないか |

2～4軸は扱いやすさの設計案で、必要試行数の実証値ではない。実物容器を参照する場合も、毎回広い計測キャンペーンは不要。狙った物性だけに効く短い比較を選ぶ。正常に動いている既存機構のbring-upを繰り返さない。

### 11.3 オフライン感度と同定

[HapticSynthesisCore](30_REUSABLE_FIRMWARE_CORE.md)へ同じbody-frame入力を与え、出力特徴zのパラメータθに対する有限差分 `J_ij≈Δz_i/Δtheta_j` を求める候補がある。衝突の有無や時刻は不連続なので、波形sample同士の差だけでなく、以下の特徴を使う。

| 入力/観測 | 切り分けたいパラメータ |
|---|---|
| ゆっくり傾けて保持 | 動き始め/停止角、静止摩擦、平衡CG、common bias |
| 一方向へ動かして停止・反転 | travel time、drag、転動慣性、slosh周波数、dynamic gain |
| 単発の代表衝突 | 衝突時刻、J、attack、band ratio、ring-down、peak/clip |
| 一定の接触移動と休止 | events/m、間隔CV、仕事率、残振、χの履歴 |
| 同じmotionで寸法/量だけ変更 | 幾何とmassの導出、物理単位、誤ったgain連動 |

全thetaを人に総当たりさせる前に、有限差分、低次元のLatin hypercube/Morris型screening、必要な組の感度行列/SVDで冗長軸を見つける。その際thetaは代表範囲または対数変化、zは代表変動幅または観測noiseで尺度を揃え、単位の選択だけでSVDの結論が変わることを避ける。ここで調べるのはパラメータの局所感度・識別可能性であり、人の知覚感度そのものではない。強い非線形・モデル切替では局所Jacobianだけで結論しない。

線形modeの減衰なら、自由減衰の同符号ピークx_k、x_(k+n)から `delta=ln(x_k/x_(k+n))/n`、`zeta=delta/sqrt((2*pi)²+delta²)` が初期推定になる。非線形損失・複数mode・装置filterが混じる信号を一つのζへ無条件に当てはめない。微細波形のRMS/PSDを合わせても、接触の因果や体感が一致する保証はない。

### 11.4 等強度、知覚軸、探索手法

周波数・ch・包絡を比較するときは、同程度に感じる強度を一度合わせる。等RMS電圧は等触感ではない。[Forta, Griffin & Morioka (2012)](https://eprints.soton.ac.uk/354940/)は弁別閾の周波数・強度・接触面積・部位依存を扱う。固定の「10%刻みなら誰でも分かる」は採用しない。

質量が大きくなれば刺激も変わるべき比較では、等強度化は原因を切り分ける補助条件にする。最終的な質量差まで消す規則にはしない。残響長を変えると総energyも変わるため、peakを揃えるのか総量を揃えるのかを課題ごとに決める。

| 手法 | 得られるもの | 選び方 |
|---|---|---|
| 手動A/B・座標探索 | 分かりやすい改善方向 | 最初のstudioに適する。交互作用と局所解を見落とす可能性 |
| coarse grid/局所応答曲面 | パラメータ間の傾向 | 同一traceでのモデル評価向き。人の全数評価には使いすぎない |
| staircase/心理測定関数 | PSE、JND、検出閾 | 好みの最大値を返す方法ではない |
| 選好Bayesian optimization | 相対比較から良い候補を探す | 少数軸・一貫した問い・応答noiseモデルが必要 |
| 情報利得型の能動学習 | 曖昧な領域や選好地形 | 早く一つを選ぶ目的とは異なる |
| 勾配/進化的探索 | 数値指標の最適化 | 接触の不連続に注意。大量の人試行を必要とする探索は初期に不向き |

[Catkin & Patoglu (2023)](https://doi.org/10.1109/TOH.2023.3266726)はhaptic renderingの現実感を選好に基づき最適化する先例。[Zhang et al. (2026), v1](https://arxiv.org/html/2604.20210v1)は振動の選好に確信度/不確実性を扱う先例である。どちらも本機の液体・砂・tilt併用での成果を保証しない。

実用案は、正のgain/時間/周波数を対数尺度、mixを0–1、model familyをカテゴリとして扱うこと。最初は一軸の大きめの差、次に関係する2～4軸。pairwise比較では `P(B>A)=logistic(u(B)−u(A))` 等のnoiseを持つ選好モデルを候補にし、「差が分からない」「確信が低い」も記録する。連続比較で好みが定常という仮定が破れたら、休止・baselineへの戻り・別セッション確認を優先する。

### 11.5 調整UIに欲しい最小機能

applied条件A/B、保存/復元、物性と提示gainの別表示、現modelで有効なcontrol、停止中のまとまった変更、送信済みと実適用の区別を先に作る。自動探索がdeviceを勝手にStartする設計にはしない。状態を保ったlive morphは、resetせず変更可能な係数とclick-freeな遷移を実装した後の別能力である。

比較記録は、FW/model版、applied値、geometry/amount、seed、課題、提示順、視覚/音の有無、判断と確信度、代表的なclip/遅れで十分な出発点になる。触覚固有の寄与を調べる場合だけ、機構音・振動音の条件を揃え、必要なら音をmaskする。正式な被験者研究では試行数・順序・統計設計を改めて決める。今回のA/B提案は検出力を計算した心理物理プロトコルではない。

## 12. 計算・メモリ予算と実装の切り方

音声sample rateと物理積分rateを同じにする必要はない。低周波状態、contact検出、高速包絡/共振、servo dispatch、telemetryをそれぞれの時間で扱い、event timestampでつなぐ。

| 処理 | 初期候補 | 予算の見方 |
|---|---|---|
| 低周波物理 | 現250 Hz nominalと最大2 ms内部刻みを基準に比較 | 実際のdt、contact時の最大substepを測る。固定周期とは呼ばない |
| 剛体/流体状態 | 玉1～8、液体1～2mode、粒体χ＋少数状態 | 全て同時導入せず、候補ごとのRAMと最悪contact数 |
| 高速共振 | 48 kHz、まず2～4mode、必要なら6mode/ch | 4ch×6×48k＝1,152,000 mode更新/秒。これはCPU時間ではない |
| 短sample | 20 msの4ch、16bit PCM | 48k×.020×4×2＝7,680 B/素材。mono＋spatialなら1,920 B |
| Event/voice | 既存固定poolを基準 | 最大contactとflow密度でoverflow/steal/mergeを観測 |
| 高速経路の係数 | exp/cosは原則configuration時、共振状態はsample更新 | 動的割当・file I/O・radio処理をaudio合成へ入れない |

上の演算数・記憶量は算術見積り。実機CPU使用率や余裕を示すbenchmarkではない。6modeで約数百万の積和/秒になっても、メモリ配置、float実装、I2S待ち、既存処理と競合する。現在のsin呼出し等を見ただけでCPU不足と断定しない。

候補の採否には、audio block実行時間/締切超過、最大voice、追加RAM、既存baselineとの差を測る。5 ms blockに対して、まず合成処理を例えば1 ms以下に収める予算案を置けるが、これは未測定の設計目標であり、達成を保証する値ではない。測って余裕がなければmode削減、係数LUT、帯域制限下の低rate合成＋補間を比較する。TDM transportの48 kHzを不用意に変える必要はない。

局所ばねの半陰的Eulerは無条件安定ではない。固定modeならexact離散化/安定IIR、剛体contactならimpulse、強い非線形だけ局所substep、と使い分ける。white-noiseを物理状態へ入れる場合はSDEの規約に応じたsqrt(dt)等の離散化を定義し、毎frame一定量の雑音やactivityを加えない。

新しいaudio-rate synthesisを導入する場合、`DriveFrame4`の既存意味を黙って変更しない。transportから独立した固定容量の励振block/voice記述等を比較実装として定義し、既存経路をAとして残す。デバイスruntimeがStop・fault・校正・物理dispatchを所有し続ける。今回の研究はこの境界変更の実装許可や完了を意味しない。

## 13. 反証可能な比較と、採用を決める順序

これは候補評価の表であり、[08](../08_IMPLEMENTATION_PLAN.md)に並立する作業計画ではない。studio/A-B baselineを先に作る方向を維持し、その中で必要な比較だけを選ぶ。

| 優先候補 | A / Bと固定条件 | 観測したい差 | 差が出ない場合の判断 |
|---|---|---|---|
| パラメータ意味 | 既存preset / 意味を明示して同じ出力へ合わせた設定 | 値と体感を説明・再現できる | 数値の物理化が未同定なら知覚値として残す |
| 時刻保持 | frame集約 / contact offset付き発音。同じcontact列 | 速い往復で接触順序が明瞭、過密な同時発音が減る | まず実遅延とjitterを再確認。mode数は増やさない |
| 接触attack | 現二carrier / J・tau分離＋2～4mode | 等強度でも硬い/柔らかい接触を区別 | 装置帯域か励振の差が届いているかを見る |
| 転がり | 現点質量 / 有限球＋転動慣性。同じ材質合成 | travelの長さと重さが動作から読み取れる | 摩擦条件/体感への寄与を確認し、複雑さを増やさない |
| 粒体 | 現drag / χ・二閾値の堆積/崩落。総量固定 | 往復時の保持→崩れ→停止が砂らしい | 閾値が単なる遅延と感じられるなら状態写像を修正 |
| 液体 | 現spring / 平衡形状＋固定基底の少数mode。小振幅から | fill/寸法と周期・減衰が一貫、表示と接触が一致 | まず体積/CG/入力重複を点検。SPHを即採用しない |
| 空間 | 現配分 / 等強度補正・power配分 | 強度むらが減り方向が分かる | grip/crosstalkで有効自由度が足りなければ単純符号化へ |
| 持続texture | 時間noise / 距離profile＋負荷制限 | 速度で細かさが自然に変わり、停止で余計な発生なし | 位置profileより単純noiseが十分ならそれを採用 |
| 既存tiltの整理 | accepted mapping / reference・位置・力/torque分離 | 慣性と移動が分かり、滑らかさと強度を保つ | 姿勢推定/サーボ実応答を確認し、filterを盲目的に増やさない |
| 表示の寄与 | 同じFWで画面非表示 / 内容表示あり | 因果の理解を助ける、画面非表示でも差が残る | 視覚だけで判断しているなら素材cueを再評価。音の寄与も区別 |

J・τ分離＋共振器、ch補正＋power配分などの一式比較は、完成候補の良否を見るもの。改善があった場合だけ、同じ共振器で励振のみ、同じch補正で配分のみを変える短い追加比較で寄与を切り分ける。複数要素を同時変更した結果から一要素の効果を断定しない。

最初の新しい状態モデルを一つ選ぶなら、説明可能性が高い**粒体の保持/崩落**または既存計画の**付着/離脱**がよい。液体は小振幅の固定平衡モデルを検証してから広い姿勢へ進める。合成の最初のBは**力積と接触時間を分けた少数mode**。この三系統を一度に全部置き換えない。

## 14. 今回の確定事項、未解決事項、調査の終点

確定できたのは、現行コードの状態・式・適用されるparameter、旧参照との相違、一次資料が示すアルゴリズム/知覚機構、その適用条件、および理想式の算術値。**本機での知覚的優位、CPU余裕、最適gain、実際のgrip、音/触覚/視覚の端から端までの遅延は今回測っていない。**

特に未解決なのは、(1)marble massの意図、(2)残る滑らかさの原因、(3)液体/砂のどのcueが最も不足するか、(4)把持を通過したch応答、(5)広角液体モデルの基底変換、(6)提案paramとtransport readbackの最小範囲。これらは文献を増やすより、同じ条件での限定した数値比較・短いhandlingから解ける。

旧[17](17_PARAMETRIC_CONTAINER_HAPTICS_MODEL_SPEC.md)には有用な候補式があるが、座標、無条件noise、dtなしactivity入力、近接由来のtap、旧servo限界、現coherentでは生成しないeventや異なるatom配分が混在する。現在の実装規範としてコピーしない。本稿はこれらを再検討した研究参照であり、旧候補を全て新たな必須仕様へ昇格させない。

探索は、低次元動力学、接触合成、知覚効果、最適化の各群で有力な代替案と制約が揃った段階で止めた。NASAの液体縮約、粒体の静止/移動二相、modal/micro-contact、統計/AR合成、視触覚/空間知覚、選好最適化を確認した。現在の結論を変えにくい類似方式の列挙は続けていない。次に必要なのは資料数の追加より、上表で選んだ仮説の検証である。

## 15. 一次資料と確認範囲

確認日はいずれも2026-09-06。本文を確認した資料でも本機への数値移植は行っていない。音響研究の自然さを触覚の実証と混同しない。一次資料の取得が部分的な項目を明記する。

| 資料 | 本稿で用いる根拠 | 確認範囲/制約 |
|---|---|---|
| H. N. Abramson編, NASA SP-106, 1966. [The Dynamic Behavior of Liquids in Moving Containers](https://ntrs.nasa.gov/citations/19670006555) | 矩形の小振幅slosh周波数、等価モデルの背景 | 公式書誌とPDFの索引済み§2.2式2.13。直接PDF取得は403、全464頁の精査はしていない |
| J.-P. Bouchaud, M. E. Cates, J. Ravi Prakash, S. F. Edwards, PRL 74:1982, 1995. [Hysteresis and Metastability in a Continuum Sandpile Model](https://journals.aps.org/prl/abstract/10.1103/PhysRevLett.74.1982) | 静止/移動粒と履歴 | 出版社抄録。全文は認証が必要 |
| L. Mahadevan, Y. Pomeau, EPL 46:595–601, 1999. [Propagating fronts on sandpile surfaces](https://softmath.seas.harvard.edu/wp-content/uploads/2019/10/pre2000-07.pdf) | BCRE系の質量交換・保存 | 著者機関の本文。有限状態χモデルは本稿の縮約案 |
| M. Macklin, M. Müller, TOG 32(4), 2013. [Position Based Fluids](https://mmacklin.com/pbf_sig_preprint.pdf) | 位置拘束による非圧縮性と反復solver | 著者原稿本文。MCU性能値ではない |
| K. van den Doel, P. G. Kry, D. K. Pai, SIGGRAPH 2001. [FoleyAutomatic](https://www.cs.mcgill.ca/~kry/pubs/foleyautomatic/foleyautomatic.pdf) | contact excitationとmodal応答の分離 | 原著§4–5の検索抽出。連続取得timeout、主に定性的な音響評価 |
| P. R. Cook, ICMC 1996 / CMJ 1997. [Physically Informed Sonic Modeling](https://quod.lib.umich.edu/i/icmc/bbp2372.1996.071/1/--physically-informed-sonic-modeling-phism-percussive?page=root%3Bsize%3D100%3Bview%3Dtext) | 物理規則に条件付けた確率的打楽器合成 | 原論文冒頭・要旨と[STK](https://raw.githubusercontent.com/thestk/stk/master/include/Shakers.h)の該当実装 |
| H. Culbertson, J. M. Romano, P. Castillo, M. Mintz, K. J. Kuchenbecker, Haptics Symposium 2012. [Refined Methods for Creating Realistic Haptic Virtual Textures](https://repository.upenn.edu/bitstreams/5f621471-2bac-420e-a3e5-7168a775a5c6/download) | 接触加速度、条件付きARMA、LSF | 原稿要旨・§3.1–3.3検索抽出。直接取得403、工具接触の研究 |
| S. Chan, C. Tymms, N. Colonnese, World Haptics 2021. [Hasti](https://www.ncolonnese.com/research/Hasti/whc2021_sc_ct_nc_final.pdf) | 共有macro/micro contactから触覚・音響を生成 | 本文の方法・評価・限界。探索的な小規模同定実験 |
| V. Agarwal, M. Cusimano, J. Traer, J. McDermott, DAFx 2021. [Object-based synthesis of scraping and rolling sounds](https://mcdermottlab.mit.edu/papers/Agarwal_etal_2021_scraping_rolling_synthesis_DAFx.pdf) | 転動/擦過の非線形接触制約 | 原著§1–2、§5–6検索抽出。全PDFの連続精査なし、音響評価 |
| K. van den Doel, ACM TAP 2(4), 2005. [Physically-based Models for Liquid Sounds](https://www.persianney.com/kvdoelcsubc/publications/tap05.pdf) | 気泡振動・統計的な液体音 | 著者原稿§2–6。液体力学の代替ではない |
| N. Heravi, H. Culbertson, A. M. Okamura, J. Bohg, IEEE ToH 17(4), 2024. [Development and Evaluation of a Learning-Based Model](https://arxiv.org/abs/2212.13332) | 学習した多素材texture | 原稿要旨・著者説明。推論コストを本機で検証していない |
| 南澤孝太・深町聡一郎・梶本裕之・川上直樹・舘暲, 日本VR学会論文誌13(1), 2008. [質量および内部ダイナミクスを提示する装着型触力覚ディスプレイ](https://www.jstage.jst.go.jp/article/tvrsj/13/1/13_KJ00007499166/_article/-char/ja/) | 指腹変形・能動運動の質量cue | J-STAGE全文PDF。ベルト機構、本機と異なる |
| M. O. Ernst, M. S. Banks, Nature 415, 2002. [Humans integrate visual and haptic information](https://www.nature.com/articles/415429a) | 信頼度に応じた感覚統合 | 出版社抄録・書誌。高さ判断、全文精査なし |
| A. Israr, I. Poupyrev, CHI 2011. [Tactile Brush](https://la.disneyresearch.com/wp-content/uploads/Tactile-Brush-Drawing-on-Skin-with-a-Tactile-Grid-Display-Paper.pdf) | phantom位置と仮現運動、energy配分 | 原著本文・装置・モデル・予備的評価の限界。背面配列 |
| T. Amemiya, H. Ando, T. Maeda, World Haptics 2005. [Virtual Force Display](https://doi.org/10.1109/WHC.2005.146) | 非対称加速度の方向cue | 著者公開PDF本文抽出。全頁表示は不安定 |
| I. M. L. C. Vogels, Human Factors 46(1), 2004. [Detection of temporal delays in visual-haptic interfaces](https://pubmed.ncbi.nlm.nih.gov/15151159/) | 視触覚遅れの検出 | 原著抄録、全文未取得。45 msを普遍閾にしない |
| N. G. Forta, M. J. Griffin, M. Morioka, 2012. [Vibrotactile difference thresholds](https://eprints.soton.ac.uk/354940/) | 弁別閾の刺激条件依存 | 大学リポジトリ原著抄録。最終稿取得不安定 |
| B. Catkin, V. Patoglu, IEEE ToH 16(4), 2023. [Preference-Based Human-in-the-Loop Optimization](https://doi.org/10.1109/TOH.2023.3266726) | 相対選好による現実感の調整 | 原著抄録と[著者補足](https://hmi.sabanciuniv.edu/HiL_Optim.pdf)。本論文全文未取得 |
| R. Zhang, X. Zhu, M. P. Khotbehsara, W. Dao, E. Bıyık, H. Culbertson, 2026. [Vibrotactile Preference Learning, v1](https://arxiv.org/html/2604.20210v1) | 不確実性/確信度を扱う振動選好学習 | arXiv v1全文。本文のUMAP/DOI記載と出版社版の一致は未照合 |

既存プロジェクトのDualVib、Gravity Grabber、Virtual Rolling Stone、Vibr-eau等の原著監査は[33](33_INTERACTION_RESEARCH_SOURCES.md)に一度記録されているため、ここでは再掲しない。
