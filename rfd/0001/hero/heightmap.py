import json, math, os
import numpy as np
from PIL import Image
GEO = "geo"  # fetched open data, see README
def merc_y(lat):
    r=math.radians(lat); return (1-math.log(math.tan(r)+1/math.cos(r))/math.pi)/2
def merc_x(lon): return (lon+180)/360
Z=11; XS=range(1763,1768); YS=range(835,839); n=2**Z
rows=[]
for y in YS:
    row=[]
    for x in XS:
        im=np.asarray(Image.open(f"{GEO}/tiles11/{x}_{y}.png").convert("RGB"),dtype=np.float64)
        row.append(im[:,:,0]*256+im[:,:,1]+im[:,:,2]/256-32768)
    rows.append(np.concatenate(row,axis=1))
E=np.concatenate(rows,axis=0)
px=n*256; ox,oy=1763/n,835/n
LON0,LON1,LAT0,LAT1=130.06,130.70,31.06,31.46
cx0=int((merc_x(LON0)-ox)*px); cx1=int((merc_x(LON1)-ox)*px); cy0=int((merc_y(LAT1)-oy)*px); cy1=int((merc_y(LAT0)-oy)*px)
E=E[cy0:cy1,cx0:cx1]; H,W=E.shape; print("crop",W,H)
# light smoothing, then downsample to ~ a third
def box(a,r):
    k=2*r+1; p=np.pad(a,r,mode="edge"); c=np.cumsum(p,axis=0); c=np.concatenate([np.zeros((1,c.shape[1])),c]); a=(c[k:]-c[:-k])/k
    c=np.cumsum(a,axis=1); c=np.concatenate([np.zeros((c.shape[0],1)),c],axis=1); return (c[:,k:]-c[:,:-k])/k
Es=box(box(E,1),1)
im=Image.fromarray(np.clip(Es+1000,0,65535).astype(np.uint16))
im=im.resize((W//2,H//2),Image.LANCZOS)
a=np.asarray(im,dtype=np.uint16)
rgb=np.zeros(a.shape+(3,),dtype=np.uint8); rgb[...,0]=(a>>8)&255; rgb[...,1]=a&255
Image.fromarray(rgb,"RGB").save("height.png",optimize=True)
mpp=40075016.686*math.cos(math.radians(31.26))/px*2
meta={"W":a.shape[1],"H":a.shape[0],"mpp":mpp,"lon":[LON0,LON1],"lat":[LAT0,LAT1],"MX0":ox+cx0/px,"MX1":ox+cx1/px,"MY0":oy+cy0/px,"MY1":oy+cy1/px,"max":float(Es.max()),"min":float(Es.min())}
json.dump(meta,open("height.json","w")); print(meta, os.path.getsize("height.png"))
