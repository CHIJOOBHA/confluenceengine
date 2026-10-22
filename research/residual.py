import pandas as pd, numpy as np
exec(open("edge_tests.py").read().split('say("=== 1.')[0])
d["gb"] = pd.cut(d.gap, [-9, -0.5, -0.15, 0.15, 0.5, 9], labels=["big down gap", "small down", "flat open", "small up", "big up gap"])
d["fill"] = (d.Low <= d.pdc) & (d.High >= d.pdc)
half = d.index[len(d)//2]
print("At the open, same gap size, split by the US move (closes above yesterday's close | gap fills) - first half / second half")
for g in d.gb.cat.categories:
    for lab, m in [("US down", d.us < -0.003), ("US up", d.us > 0.003)]:
        x = d[(d.gb == g) & m]; a, b = x[x.index < half], x[x.index >= half]
        print(f"  {g:13s} {lab:8s} close above {a.closeUp.mean():.0%}/{b.closeUp.mean():.0%} (n={len(a)}/{len(b)}) | gap fills {a.fill.mean():.0%}/{b.fill.mean():.0%}")
# night-before model: CLV only vs CLV + US, walk-forward Brier for high-break
def brier(cols):
    preds=[]; 
    for i in range(500, len(d)):
        tr = d.iloc[:i]; r = d.iloc[i]
        m = np.ones(len(tr), bool)
        for c in cols: m &= (tr[c] == r[c]).values
        n = m.sum(); p = (tr.brkH.values[m].sum()+1)/(n+2) if n >= 10 else (tr.brkH.mean())
        preds.append((p, r.brkH))
    P = np.array(preds, float); acc = ((P[:,0]>=0.6)&(P[:,1]==1)).sum()+((P[:,0]<=0.4)&(P[:,1]==0)).sum(); calls=((P[:,0]>=0.6)|(P[:,0]<=0.4)).sum()
    return np.mean((P[:,0]-P[:,1])**2), acc/calls, calls
d["clvb5"] = pd.cut(d.clv, [-.01,.1,.25,.4,.6,.75,.9,1.01]).astype(str)
d["usb"] = pd.cut(d.us, [-1,-0.01,-0.003,0.003,0.01,1]).astype(str)
for name, cols in [("CLV only (today's model)", ["clvb5"]), ("CLV + overnight US", ["clvb5","usb"])]:
    b, acc, calls = brier(cols)
    print(f"Night-before 'high breaks' walk-forward: {name:28s} Brier {b:.3f}  calls {calls}  right {acc:.0%}")
