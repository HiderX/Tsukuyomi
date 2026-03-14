#!/usr/bin/env python3
"""
生成「哭」动作 motion3.json：通过连续关键帧驱动表情参数（眼泪/泪珠 + 轻微低头），
保证动作连续变化。输出到 static/yachiyo-kaguya/motions/yachiyo_cry.motion3.json
"""
import json
import os

# 动作总时长（秒）
DURATION = 3.5
FPS = 30.0

def linear_segments(keyframes):
    """将 (time, value) 列表转为 motion3 的 Segments 数组（全用线性段）。"""
    if len(keyframes) < 2:
        raise ValueError("至少需要 2 个关键帧")
    segs = []
    t0, v0 = keyframes[0]
    segs.extend([t0, v0])
    for t1, v1 in keyframes[1:]:
        segs.append(0)  # 0 = linear
        segs.extend([t1, v1])
    return segs

def main():
    # ParamExpression_1（眼泪）：0 -> 1 缓入，保持，再缓出到 0
    kf_tears = [
        (0.0, 0.0),
        (0.12, 0.25),
        (0.25, 0.6),
        (0.38, 1.0),
        (2.9, 1.0),
        (3.05, 0.6),
        (3.2, 0.25),
        (3.35, 0.0),
    ]
    # ParamExpression_2（泪珠/眼周）：略滞后一点，同样连续
    kf_teardrop = [
        (0.0, 0.0),
        (0.15, 0.2),
        (0.3, 0.7),
        (0.45, 1.0),
        (2.85, 1.0),
        (3.0, 0.6),
        (3.15, 0.2),
        (3.3, 0.0),
    ]
    # ParamAngleX：轻微低头（哭时低头），连续
    kf_angle_x = [
        (0.0, 0.0),
        (0.4, -2.0),
        (1.2, -3.5),
        (2.2, -3.2),
        (3.0, -1.5),
        (3.5, 0.0),
    ]
    # Model Opacity：全程不透明
    kf_opacity = [(0.0, 1.0), (DURATION, 1.0)]

    curves = [
        {"Target": "Model", "Id": "Opacity", "Segments": linear_segments(kf_opacity)},
        {"Target": "Parameter", "Id": "ParamExpression_1", "Segments": linear_segments(kf_tears)},
        {"Target": "Parameter", "Id": "ParamExpression_2", "Segments": linear_segments(kf_teardrop)},
        {"Target": "Parameter", "Id": "ParamAngleX", "Segments": linear_segments(kf_angle_x)},
    ]

    total_segments = 0
    total_points = 0
    for c in curves:
        segs = c["Segments"]
        # 格式：起点(t,v) + 每段 [0, t, v]；段数 = (len(segs)-2)//3，点数 = 段数+1
        n_seg = (len(segs) - 2) // 3
        n_pts = n_seg + 1
        total_segments += n_seg
        total_points += n_pts

    meta = {
        "Duration": DURATION,
        "Fps": FPS,
        "Loop": False,
        "AreBeziersRestricted": True,
        "CurveCount": len(curves),
        "TotalSegmentCount": total_segments,
        "TotalPointCount": total_points,
        "UserDataCount": 0,
        "TotalUserDataSize": 0,
    }

    out = {"Version": 3, "Meta": meta, "Curves": curves}

    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    motion_dir = os.path.join(root, "static", "yachiyo-kaguya", "motions")
    os.makedirs(motion_dir, exist_ok=True)
    path = os.path.join(motion_dir, "yachiyo_cry.motion3.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(out, f, indent="\t", ensure_ascii=False)
    print("已生成:", path)

if __name__ == "__main__":
    main()
