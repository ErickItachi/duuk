import test from 'node:test'
import assert from 'node:assert/strict'
import { avatarCropRect } from '../src/admin/avatarCrop.mjs'

test('portrait and landscape framing stay square and inside the source at every pan/zoom boundary', () => {
  for (const [width, height] of [[6000,4000],[3000,6000],[512,512],[1,1000]]) for (const zoom of [1,1.5,4]) for (const x of [-1,0,1]) for (const y of [-1,0,1]) {
    const crop=avatarCropRect(width,height,zoom,{x,y})
    assert(crop.side>0&&crop.left>=0&&crop.top>=0)
    assert(crop.left+crop.side<=width+.000001&&crop.top+crop.side<=height+.000001)
    assert.equal(crop.side,Math.min(width,height)/zoom)
  }
})
test('drag direction matches the visible photo and invalid coordinates cannot escape the source', () => {
  assert.deepEqual(avatarCropRect(4000,2000,1,{x:1,y:0}),{left:0,top:0,side:2000})
  assert.deepEqual(avatarCropRect(4000,2000,1,{x:-1,y:0}),{left:2000,top:0,side:2000})
  assert.deepEqual(avatarCropRect(4000,2000,1,{x:Infinity,y:NaN}),{left:1000,top:0,side:2000})
  assert.throws(()=>avatarCropRect(0,2000))
})
