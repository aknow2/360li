import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { TestContext } from 'node:test';
import * as THREE from 'three';
import type { BuiltPart } from '../../src/domain/builtPart';
import { DEFAULT_PARAMS } from '../../src/domain/params';
import {
  createGrayscaleTextureHandle,
  observeElementResize,
  createViewerMountLifecycle,
  createViewerPresentationController,
  type GrayscaleTextureDependencies,
  type TextureMaterialTarget,
  type ViewerMaterials,
} from '../../src/components/Viewer';
import { decodeImageToImageData, type ImageDecodeDependencies } from '../../src/lithophane/imageDecode';
import {
  createSceneFrameLoop,
  createSceneResourceLifecycle,
  initializeSceneResourceLifecycle,
} from '../../src/three/scene';

function hash(bytes: Uint8ClampedArray): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function sourceImage(): ImageData {
  return {
    width: 2,
    height: 1,
    data: new Uint8ClampedArray([10, 20, 30, 7, 200, 100, 50, 9]),
  } as ImageData;
}

function file(): File {
  return new File(['pixels'], 'source.png', { type: 'image/png', lastModified: 1 });
}

type FakeTexture = { disposeCount: number; dispose(): void };
type FakeCanvas = {
  width: number;
  height: number;
  putCount: number;
  getContext(kind: string): { putImageData(image: ImageData, x: number, y: number): void } | null;
};

function textureFixture() {
  const created = {
    imageData: [] as ImageData[],
    grayBytes: [] as Uint8ClampedArray[],
    canvases: [] as FakeCanvas[],
    textures: [] as FakeTexture[],
  };
  const dependencies: GrayscaleTextureDependencies = {
    createImageData(bytes, width, height) {
      const image = { data: bytes, width, height } as ImageData;
      created.grayBytes.push(bytes);
      created.imageData.push(image);
      return image;
    },
    createCanvas(width, height) {
      const canvas: FakeCanvas = {
        width,
        height,
        putCount: 0,
        getContext(kind) {
          assert.equal(kind, '2d');
          return {
            putImageData(image, x, y) {
              assert.equal(image, created.imageData.at(-1));
              assert.equal(x, 0);
              assert.equal(y, 0);
              canvas.putCount += 1;
            },
          };
        },
      };
      created.canvases.push(canvas);
      return canvas as unknown as HTMLCanvasElement;
    },
    createTexture() {
      const texture: FakeTexture = {
        disposeCount: 0,
        dispose() { texture.disposeCount += 1; },
      };
      created.textures.push(texture);
      return texture as unknown as THREE.Texture;
    },
  };
  return { created, dependencies };
}

function material(): TextureMaterialTarget & { disposeCount: number; dispose(): void } {
  return {
    map: null,
    needsUpdate: false,
    disposeCount: 0,
    dispose() { this.disposeCount += 1; },
  };
}

function materials(): ViewerMaterials {
  return { outer: material(), inner: material(), wall: material() };
}

type FakeGeometry = {
  id: string;
  disposeCount: number;
  dispose(): void;
};

function fakeGeometry(id: string): FakeGeometry {
  return {
    id,
    disposeCount: 0,
    dispose() { this.disposeCount += 1; },
  };
}

function part(id: string, split = false, image = sourceImage()): BuiltPart {
  return {
    geometry: { id } as unknown as THREE.BufferGeometry,
    workingImage: image,
    summary: { vertexCount: 3, triangleCount: 1 },
    snapshot: {
      params: Object.freeze({
        ...DEFAULT_PARAMS,
        horizontalSplitCount: split ? 2 : 1,
        verticalSplitCount: split ? 2 : 1,
        splitIndex: split ? 3 : 1,
      }),
      source: Object.freeze({
        file: {} as File,
        name: `${id}.png`,
        size: 8,
        type: 'image/png',
        lastModified: 1,
      }),
    },
    fileName: split ? 'split.stl' : 'spherical-lithophane.stl',
  };
}

export async function registerTests(t: TestContext): Promise<void> {
  await t.test('grayscale handle copies bytes/buffer, converts once, attaches outer only, and releases owned resources', () => {
    const source = sourceImage();
    const beforeBytes = new Uint8ClampedArray(source.data);
    const beforeHash = hash(source.data);
    const { created, dependencies } = textureFixture();
    const set = materials();
    const handle = createGrayscaleTextureHandle(source, dependencies);

    assert.equal(created.grayBytes.length, 1);
    assert.notEqual(created.grayBytes[0], source.data);
    assert.notEqual(created.grayBytes[0].buffer, source.data.buffer);
    assert.deepEqual([...created.grayBytes[0]], [19, 19, 19, 255, 118, 118, 118, 255]);
    assert.deepEqual([...source.data], [...beforeBytes]);
    assert.equal(hash(source.data), beforeHash);
    assert.equal(created.imageData.length, 1);
    assert.equal(created.canvases.length, 1);
    assert.equal(created.canvases[0].putCount, 1);
    assert.equal(created.textures.length, 1);

    handle.attach(set.outer);
    assert.equal(set.outer.map, created.textures[0]);
    assert.equal(set.inner.map, null);
    assert.equal(set.wall.map, null);
    handle.detach();
    assert.equal(set.outer.map, null);
    handle.attach(set.outer);
    handle.detach();
    handle.attach(set.outer);
    assert.equal(created.grayBytes.length, 1);
    assert.equal(created.canvases.length, 1);
    assert.equal(created.textures.length, 1);
    assert.deepEqual([...source.data], [...beforeBytes]);
    assert.equal(hash(source.data), beforeHash);

    handle.dispose();
    handle.dispose();
    assert.equal(set.outer.map, null);
    assert.equal(created.textures[0].disposeCount, 1);
    assert.equal(created.canvases[0].width, 0);
    assert.equal(created.canvases[0].height, 0);
    assert.deepEqual(handle.snapshot(), {
      disposed: true,
      attached: false,
      hasGrayBytes: false,
      hasImageData: false,
      hasCanvas: false,
      hasTexture: false,
    });
    assert.deepEqual([...source.data], [...beforeBytes]);
    assert.equal(hash(source.data), beforeHash);
  });

  await t.test('presentation order retains camera mode across null and resets only split-to-legacy', () => {
    const calls: string[] = [];
    const cloneBounds = new THREE.Box3(new THREE.Vector3(-1, -1, -1), new THREE.Vector3(1, 1, 1));
    const scene = {
      setMesh(mesh: unknown | null) { calls.push(`setMesh:${mesh ? 'mesh' : 'null'}`); },
      resize() { calls.push('resize'); },
      fitCameraToBounds(bounds: THREE.Box3) {
        assert.equal(bounds, cloneBounds);
        calls.push('fit');
      },
      resetLegacyCameraFrame() { calls.push('reset'); },
    };
    const clones: FakeGeometry[] = [];
    const textureDisposals: number[] = [];
    const controller = createViewerPresentationController(scene, materials(), {
      cloneGeometry(source) {
        const clone = fakeGeometry(`clone-${(source as unknown as { id: string }).id}`);
        clones.push(clone);
        return clone as unknown as THREE.BufferGeometry;
      },
      createMesh(geometry) { return { geometry } as unknown as THREE.Mesh; },
      getBounds(geometry) {
        assert.equal(geometry, clones.at(-1));
        return cloneBounds;
      },
      createTextureHandle() {
        const slot = textureDisposals.length;
        textureDisposals.push(0);
        return {
          attach() {}, detach() {},
          dispose() { textureDisposals[slot] += 1; },
          snapshot() { return { disposed: false, attached: false, hasGrayBytes: true, hasImageData: true, hasCanvas: true, hasTexture: true }; },
        };
      },
    });

    const legacyA = part('legacy-a');
    controller.present(legacyA);
    assert.deepEqual(calls, ['setMesh:mesh', 'resize']);
    controller.present(legacyA);
    assert.deepEqual(calls, ['setMesh:mesh', 'resize'], 'same Built Part identity is a no-op');

    calls.length = 0;
    controller.present(part('legacy-b'));
    assert.deepEqual(calls, ['setMesh:null', 'setMesh:mesh', 'resize']);
    assert.equal(clones[0].disposeCount, 1);

    calls.length = 0;
    controller.present(part('split', true));
    assert.deepEqual(calls, ['setMesh:null', 'setMesh:mesh', 'resize', 'fit']);
    assert.equal(controller.snapshot().cameraMode, 'split-fitted');

    calls.length = 0;
    controller.present(null);
    assert.deepEqual(calls, ['setMesh:null']);
    assert.equal(controller.snapshot().cameraMode, 'split-fitted');
    controller.present(null);
    assert.deepEqual(calls, ['setMesh:null'], 'repeated clear and non-presentation/stale work are no-ops');

    calls.length = 0;
    controller.present(part('legacy-after-split'));
    assert.deepEqual(calls, ['setMesh:mesh', 'reset', 'resize']);
    assert.equal(controller.snapshot().cameraMode, 'legacy');

    calls.length = 0;
    controller.present(part('legacy-repeat'));
    assert.deepEqual(calls, ['setMesh:null', 'setMesh:mesh', 'resize']);
    assert.equal(calls.includes('reset'), false);
    assert.equal(clones.length, 5);
    assert.deepEqual(textureDisposals.slice(0, 4), [1, 1, 1, 1]);
    controller.dispose();
    assert.deepEqual(clones.map((clone) => clone.disposeCount), [1, 1, 1, 1, 1]);
    assert.deepEqual(textureDisposals, [1, 1, 1, 1, 1]);
  });

  await t.test('controller clones per Built Part identity; toggles/live drafts do not clone or reframe; cleanup never disposes sources', () => {
    const calls: string[] = [];
    let invalidationCount = 0;
    const source = sourceImage();
    const beforeBytes = new Uint8ClampedArray(source.data);
    const beforeHash = hash(source.data);
    const sourceDispose = new Map<string, number>();
    const clones: FakeGeometry[] = [];
    const textureFixtureState = textureFixture();
    const set = materials();
    const scene = {
      setMesh(mesh: unknown | null) { calls.push(`setMesh:${mesh ? 'mesh' : 'null'}`); },
      resize() { calls.push('resize'); },
      fitCameraToBounds() { calls.push('fit'); },
      resetLegacyCameraFrame() { calls.push('reset'); },
      invalidate() { invalidationCount += 1; },
    };
    const controller = createViewerPresentationController(scene, set, {
      cloneGeometry(geometry) {
        const id = (geometry as unknown as { id: string }).id;
        sourceDispose.set(id, sourceDispose.get(id) ?? 0);
        const clone = fakeGeometry(`clone-${id}`);
        clones.push(clone);
        return clone as unknown as THREE.BufferGeometry;
      },
      createMesh(geometry) { return { geometry } as unknown as THREE.Mesh; },
      getBounds() { return new THREE.Box3(new THREE.Vector3(-2, -1, -3), new THREE.Vector3(4, 5, 6)); },
      createTextureHandle(image) { return createGrayscaleTextureHandle(image, textureFixtureState.dependencies); },
    });
    const first = part('one', true, source);
    const second = part('two', true, source);

    controller.present(first);
    const presentationCalls = [...calls];
    controller.setShowTexture(false);
    controller.setShowTexture(true);
    controller.setShowTexture(false);
    // Simulated unbuilt transform/split draft edits never enter this controller.
    assert.deepEqual(calls, presentationCalls);
    assert.equal(clones.length, 1);
    assert.equal(textureFixtureState.created.textures.length, 1);
    assert.equal(invalidationCount, 3, 'every visible texture attach/detach explicitly invalidates the scene');

    controller.present(second);
    assert.equal(clones.length, 2);
    assert.equal(clones[0].disposeCount, 1);
    assert.equal(textureFixtureState.created.textures[0].disposeCount, 1);
    assert.deepEqual([...source.data], [...beforeBytes]);
    assert.equal(hash(source.data), beforeHash);

    controller.present(null);
    assert.equal(clones[1].disposeCount, 1);
    assert.equal(textureFixtureState.created.textures[1].disposeCount, 1);
    controller.present(null);
    controller.dispose();
    controller.dispose();
    assert.deepEqual(clones.map((clone) => clone.disposeCount), [1, 1]);
    assert.deepEqual([...sourceDispose.values()], [0, 0]);
    assert.equal((set.outer as ReturnType<typeof material>).disposeCount, 1);
    assert.equal((set.inner as ReturnType<typeof material>).disposeCount, 1);
    assert.equal((set.wall as ReturnType<typeof material>).disposeCount, 1);
    assert.deepEqual(controller.snapshot(), {
      disposed: true,
      cameraMode: 'split-fitted',
      hasBuiltPart: false,
      hasMesh: false,
      hasGeometryClone: false,
      hasTextureHandle: false,
    });
    assert.deepEqual([...source.data], [...beforeBytes]);
    assert.equal(hash(source.data), beforeHash);
  });

  await t.test('failed setup removes any attached mesh before disposing partial Viewer resources', () => {
    const events: string[] = [];
    const clone = fakeGeometry('failed-clone');
    clone.dispose = () => { clone.disposeCount += 1; events.push('clone.dispose'); };
    const set = materials();
    const controller = createViewerPresentationController({
      setMesh(mesh: unknown | null) { events.push(`setMesh:${mesh ? 'mesh' : 'null'}`); },
      resize() { events.push('resize'); },
      fitCameraToBounds() { events.push('fit'); throw new Error('fit failed'); },
      resetLegacyCameraFrame() { events.push('reset'); },
    }, set, {
      cloneGeometry() { return clone as unknown as THREE.BufferGeometry; },
      createMesh(geometry) { return { geometry } as unknown as THREE.Mesh; },
      getBounds() { return new THREE.Box3(new THREE.Vector3(-1, -1, -1), new THREE.Vector3(1, 1, 1)); },
      createTextureHandle() {
        return {
          attach() { events.push('texture.attach'); },
          detach() { events.push('texture.detach'); },
          dispose() { events.push('texture.dispose'); },
          snapshot() { return { disposed: false, attached: true, hasGrayBytes: true, hasImageData: true, hasCanvas: true, hasTexture: true }; },
        };
      },
    });
    assert.throws(() => controller.present(part('failed', true)), /fit failed/);
    const removeIndex = events.lastIndexOf('setMesh:null');
    assert.ok(removeIndex >= 0);
    assert.ok(removeIndex < events.indexOf('texture.dispose'));
    assert.ok(removeIndex < events.indexOf('clone.dispose'));
    assert.equal(clone.disposeCount, 1);
    assert.equal(controller.snapshot().hasBuiltPart, false);
  });

  await t.test('every presentation allocation stage fails atomically with ordered exact-once cleanup', () => {
    for (const stage of ['bounds', 'texture', 'mesh', 'attach', 'setMesh', 'resize', 'fit'] as const) {
      const events: string[] = [];
      const clone = fakeGeometry(`clone-${stage}`);
      clone.dispose = () => { clone.disposeCount += 1; events.push('clone.dispose'); };
      let sourceDisposeCount = 0;
      const sourcePart = part(`source-${stage}`, true);
      (sourcePart.geometry as unknown as { dispose(): void }).dispose = () => { sourceDisposeCount += 1; };
      let textureDisposeCount = 0;
      const controller = createViewerPresentationController({
        setMesh(mesh: unknown | null) {
          events.push(`setMesh:${mesh ? 'mesh' : 'null'}`);
          if (stage === 'setMesh' && mesh) throw new Error('setMesh failed');
        },
        resize() { events.push('resize'); if (stage === 'resize') throw new Error('resize failed'); },
        fitCameraToBounds() { events.push('fit'); if (stage === 'fit') throw new Error('fit failed'); },
        resetLegacyCameraFrame() { events.push('reset'); },
      }, materials(), {
        cloneGeometry() { events.push('clone'); return clone as unknown as THREE.BufferGeometry; },
        getBounds() {
          events.push('bounds');
          if (stage === 'bounds') throw new Error('bounds failed');
          return new THREE.Box3(new THREE.Vector3(-1, -1, -1), new THREE.Vector3(1, 1, 1));
        },
        createTextureHandle() {
          events.push('texture:create');
          if (stage === 'texture') throw new Error('texture failed');
          return {
            attach() { events.push('texture.attach'); if (stage === 'attach') throw new Error('attach failed'); },
            detach() { events.push('texture.detach'); },
            dispose() { textureDisposeCount += 1; events.push('texture.dispose'); },
            snapshot() { return { disposed: false, attached: false, hasGrayBytes: true, hasImageData: true, hasCanvas: true, hasTexture: true }; },
          };
        },
        createMesh() {
          events.push('mesh:create');
          if (stage === 'mesh') throw new Error('mesh failed');
          return {} as THREE.Mesh;
        },
      });

      assert.throws(() => controller.present(sourcePart), new RegExp(`${stage} failed`));
      assert.equal(sourceDisposeCount, 0, `${stage} never disposes the BuiltPart source`);
      assert.equal(clone.disposeCount, 1, `${stage} disposes its clone exactly once`);
      assert.equal(textureDisposeCount, ['bounds', 'texture'].includes(stage) ? 0 : 1);
      const removeIndex = events.lastIndexOf('setMesh:null');
      assert.ok(removeIndex >= 0, `${stage} clears scene state`);
      assert.ok(removeIndex < events.indexOf('clone.dispose'), `${stage} clears before clone disposal`);
      if (textureDisposeCount) {
        assert.ok(removeIndex < events.indexOf('texture.detach'));
        assert.ok(events.indexOf('texture.detach') < events.indexOf('texture.dispose'));
        assert.ok(events.indexOf('texture.dispose') < events.indexOf('clone.dispose'));
      }
      assert.deepEqual(controller.snapshot(), {
        disposed: false,
        cameraMode: 'legacy',
        hasBuiltPart: false,
        hasMesh: false,
        hasGeometryClone: false,
        hasTextureHandle: false,
      });
    }
  });

  await t.test('presentation setup preserves its original error when cleanup also fails', () => {
    const clone = fakeGeometry('cleanup-error');
    const controller = createViewerPresentationController({
      setMesh(mesh: unknown | null) {
        if (mesh) throw new Error('original setMesh failure');
        throw new Error('cleanup setMesh failure');
      },
      resize() {}, fitCameraToBounds() {}, resetLegacyCameraFrame() {},
    }, materials(), {
      cloneGeometry: () => clone as unknown as THREE.BufferGeometry,
      getBounds: () => new THREE.Box3(new THREE.Vector3(-1, -1, -1), new THREE.Vector3(1, 1, 1)),
      createMesh: () => ({} as THREE.Mesh),
      createTextureHandle: () => ({
        attach() {}, detach() { throw new Error('cleanup detach failure'); },
        dispose() { throw new Error('cleanup texture failure'); },
        snapshot() { return { disposed: false, attached: false, hasGrayBytes: true, hasImageData: true, hasCanvas: true, hasTexture: true }; },
      }),
    });
    assert.throws(() => controller.present(part('original', true)), /original setMesh failure/);
    assert.equal(clone.disposeCount, 1, 'later cleanup continues after earlier cleanup errors');
  });

  await t.test('grayscale allocation failures release every created canvas and preserve the original error', () => {
    for (const stage of ['getContext', 'putImageData', 'createTexture'] as const) {
      const canvas: FakeCanvas = {
        width: 2,
        height: 1,
        putCount: 0,
        getContext() {
          if (stage === 'getContext') return null;
          return {
            putImageData() {
              canvas.putCount += 1;
              if (stage === 'putImageData') throw new Error('putImageData failed');
            },
          };
        },
      };
      const expected = stage === 'getContext'
        ? /2D canvas context unavailable/
        : new RegExp(`${stage} failed`);
      assert.throws(() => createGrayscaleTextureHandle(sourceImage(), {
        createImageData: (bytes, width, height) => ({ data: bytes, width, height }) as ImageData,
        createCanvas: () => canvas as unknown as HTMLCanvasElement,
        createTexture: () => {
          if (stage === 'createTexture') throw new Error('createTexture failed');
          return { dispose() {} } as THREE.Texture;
        },
      }), expected);
      assert.equal(canvas.width, 0, `${stage} releases canvas width`);
      assert.equal(canvas.height, 0, `${stage} releases canvas height`);
    }
  });

  await t.test('bitmap decode closes once and zeroes its temporary canvas on success and every post-decode failure', async () => {
    for (const stage of ['success', 'context', 'draw', 'pixels', 'working'] as const) {
      let closeCount = 0;
      const canvas = { width: 0, height: 0 } as HTMLCanvasElement;
      const pixels = sourceImage();
      const dependencies: ImageDecodeDependencies = {
        createImageBitmap: async () => ({
          width: 2,
          height: 1,
          close() { closeCount += 1; },
        }) as ImageBitmap,
        createImageElement: () => { throw new Error('fallback must not run'); },
        createObjectURL: () => { throw new Error('fallback must not run'); },
        revokeObjectURL: () => { throw new Error('fallback must not run'); },
        createCanvas: () => {
          Object.assign(canvas, {
            getContext: () => stage === 'context' ? null : {
              drawImage() { if (stage === 'draw') throw new Error('draw failed'); },
              getImageData() { if (stage === 'pixels') throw new Error('pixels failed'); return pixels; },
            },
          });
          return canvas;
        },
        createWorkingImage(image) {
          if (stage === 'working') throw new Error('working failed');
          return { ...image, data: new Uint8ClampedArray(image.data) } as ImageData;
        },
      };

      if (stage === 'success') {
        const decoded = await decodeImageToImageData(file(), {}, dependencies);
        assert.deepEqual([...decoded.imageData.data], [...pixels.data]);
      } else {
        await assert.rejects(decodeImageToImageData(file(), {}, dependencies));
      }
      assert.equal(closeCount, 1, `${stage} closes the successfully-created bitmap once`);
      assert.equal(canvas.width, 0, `${stage} releases temporary canvas width`);
      assert.equal(canvas.height, 0, `${stage} releases temporary canvas height`);
    }
  });

  await t.test('HTMLImage fallback revokes each Object URL once on success, load, and setup failures', async () => {
    for (const stage of ['success', 'load', 'element', 'setup'] as const) {
      const events: string[] = [];
      const canvas = { width: 0, height: 0 } as HTMLCanvasElement;
      const dependencies: ImageDecodeDependencies = {
        createImageBitmap: null,
        createObjectURL() { events.push('create:url'); return 'blob:test'; },
        revokeObjectURL(url) { events.push(`revoke:${url}`); },
        createImageElement() {
          events.push('create:image');
          if (stage === 'element') throw new Error('element failed');
          const image: Record<string, unknown> = { naturalWidth: 2, naturalHeight: 1 };
          Object.defineProperty(image, 'src', {
            set() {
              if (stage === 'setup') throw new Error('setup failed');
              queueMicrotask(() => {
                const callback = image[stage === 'load' ? 'onerror' : 'onload'] as (() => void);
                callback();
              });
            },
          });
          return image as unknown as HTMLImageElement;
        },
        createCanvas: () => {
          Object.assign(canvas, {
            getContext: () => ({ drawImage() {}, getImageData: () => sourceImage() }),
          });
          return canvas;
        },
        createWorkingImage: (image) => ({ ...image, data: new Uint8ClampedArray(image.data) }) as ImageData,
      };
      if (stage === 'success') await decodeImageToImageData(file(), {}, dependencies);
      else await assert.rejects(decodeImageToImageData(file(), {}, dependencies));
      assert.equal(events.filter((event) => event === 'create:url').length, 1);
      assert.deepEqual(events.filter((event) => event.startsWith('revoke:')), ['revoke:blob:test']);
      if (stage === 'success' || stage === 'load') {
        assert.equal(canvas.width, 0);
        assert.equal(canvas.height, 0);
      }
    }
  });

  await t.test('scene cleanup is idempotent and a queued frame cannot render or restart RAF after disposal', () => {
    const events: string[] = [];
    let nextId = 0;
    const queued = new Map<number, FrameRequestCallback>();
    const lifecycle = createSceneResourceLifecycle({
      requestFrame(callback) { const id = ++nextId; queued.set(id, callback); events.push(`request:${id}`); return id; },
      cancelFrame(id) { events.push(`cancel:${id}`); queued.delete(id); },
      renderFrame() { events.push('render'); return true; },
      removeInvalidationListeners() { events.push('controls:listener:remove'); },
      clearMesh() { events.push('mesh:null'); },
      disposeControls() { events.push('controls:dispose'); },
      disposeRenderer() { events.push('renderer:dispose'); },
    });
    lifecycle.start();
    const first = queued.get(1)!;
    first(10);
    const alreadyQueued = queued.get(2)!;
    lifecycle.dispose();
    lifecycle.dispose();
    alreadyQueued(20);
    assert.deepEqual(events, [
      'request:1', 'render', 'request:2', 'cancel:2', 'controls:listener:remove',
      'mesh:null', 'controls:dispose', 'renderer:dispose',
    ]);
    assert.deepEqual(lifecycle.snapshot(), { disposed: true, running: false, frameRequest: null });
  });

  await t.test('a settled static scene renders initial and explicit invalidations, then leaves no RAF pending', () => {
    const staticMesh = { rotation: { x: 0, y: 0, z: 0 } } as THREE.Mesh;
    let staticMeshRenders = 0;
    const staticMeshLoop = createSceneFrameLoop({
      getMesh: () => staticMesh,
      updateControls: () => false,
      updateCameraLight() {},
      render() { staticMeshRenders += 1; },
    }, 0);
    assert.equal(staticMeshLoop.renderFrame(0, true), false, 'mesh presence alone does not keep RAF alive');
    assert.equal(staticMeshRenders, 1);

    const queued = new Map<number, FrameRequestCallback>();
    const renders: string[] = [];
    let nextId = 0;
    let reason = 'initial creation';
    const lifecycle = createSceneResourceLifecycle({
      requestFrame(callback) { const id = ++nextId; queued.set(id, callback); return id; },
      cancelFrame(id) { queued.delete(id); },
      renderFrame() { renders.push(reason); return false; },
      removeInvalidationListeners() {},
      clearMesh() {},
      disposeControls() {},
      disposeRenderer() {},
    });

    lifecycle.start();
    queued.get(1)!(0);
    queued.delete(1);
    assert.deepEqual(renders, ['initial creation']);
    assert.deepEqual(lifecycle.snapshot(), { disposed: false, running: false, frameRequest: null });

    for (const explicitInvalidation of [
      'setMesh', 'resize', 'split camera fit', 'legacy camera reset',
      'center-light change', 'texture visibility change',
    ]) {
      reason = explicitInvalidation;
      lifecycle.invalidate();
      const [id, callback] = [...queued.entries()].at(-1)!;
      callback(id * 10);
      queued.delete(id);
      assert.equal(lifecycle.snapshot().running, false, `${explicitInvalidation} settles after rendering`);
    }
    assert.deepEqual(renders, [
      'initial creation', 'setMesh', 'resize', 'split camera fit', 'legacy camera reset',
      'center-light change', 'texture visibility change',
    ]);
  });

  await t.test('OrbitControls damping renders until update settles, then idles', () => {
    const updates = [true, true, false];
    let renderCount = 0;
    const loop = createSceneFrameLoop({
      getMesh: () => null,
      updateControls: () => updates.shift() ?? false,
      updateCameraLight() {},
      render() { renderCount += 1; },
    }, 0);

    assert.equal(loop.renderFrame(0), true);
    assert.equal(loop.renderFrame(16), true);
    assert.equal(loop.renderFrame(32), false);
    assert.equal(renderCount, 3, 'every visible damping step, including the settled frame, is rendered');
  });

  await t.test('model animation keeps scheduling at its refresh cadence and disable renders one final frame then settles', () => {
    const mesh = { rotation: { x: 0, y: 0, z: 0 } } as THREE.Mesh;
    const renderTimes: number[] = [];
    let now = 0;
    const loop = createSceneFrameLoop({
      getMesh: () => mesh,
      updateControls: () => false,
      updateCameraLight() {},
      render() { renderTimes.push(now); },
    }, 0);
    loop.setAnimationSettings({
      enabled: true,
      rotationSpeedDegPerSec: 90,
      rotationAxis: 'y',
      refreshRateHz: 20,
    });

    for (now of [0, 16, 32, 50, 66, 100]) assert.equal(loop.renderFrame(now), true);
    assert.deepEqual(renderTimes, [0, 50, 100]);
    assert.ok(mesh.rotation.y > 0, 'enabled animation preserves model rotation');

    now = 110;
    assert.equal(loop.renderFrame(now, true), true);
    assert.deepEqual(renderTimes, [0, 50, 100, 110], 'explicit invalidation renders immediately between cadence ticks');

    loop.setAnimationSettings({
      enabled: false,
      rotationSpeedDegPerSec: 90,
      rotationAxis: 'y',
      refreshRateHz: 20,
    });
    now = 116;
    assert.equal(loop.renderFrame(now), false);
    assert.deepEqual(renderTimes, [0, 50, 100, 110, 116], 'disable invalidation produces a final visible frame');
  });

  await t.test('Viewer mount lifecycle removes its listener/observer once and disposes presentation before scene', () => {
    const events: string[] = [];
    const listener = () => events.push('resize');
    const lifecycle = createViewerMountLifecycle({
      addWindowResizeListener(received) { assert.equal(received, listener); events.push('listener:add'); },
      removeWindowResizeListener(received) { assert.equal(received, listener); events.push('listener:remove'); },
      resizeListener: listener,
      observeResize() { events.push('observer:observe'); return () => events.push('observer:disconnect'); },
      disposePresentation() { events.push('presentation:dispose'); },
      disposeScene() { events.push('scene:dispose'); },
    });
    lifecycle.dispose();
    lifecycle.dispose();
    assert.deepEqual(events, [
      'listener:add', 'observer:observe', 'listener:remove', 'observer:disconnect',
      'presentation:dispose', 'scene:dispose',
    ]);
  });

  await t.test('Viewer mount setup failure rolls back every applicable resource once and preserves the setup error', () => {
    for (const stage of ['add-listener', 'observe'] as const) {
      const events: string[] = [];
      const setupError = new Error(`${stage} setup failed`);
      const listener = () => {};
      assert.throws(() => createViewerMountLifecycle({
        addWindowResizeListener() {
          events.push('listener:add');
          if (stage === 'add-listener') throw setupError;
        },
        removeWindowResizeListener() {
          events.push('listener:remove');
          throw new Error('listener cleanup failed');
        },
        resizeListener: listener,
        observeResize() {
          events.push('observer:observe');
          throw setupError;
        },
        disposePresentation() {
          events.push('presentation:dispose');
          throw new Error('presentation cleanup failed');
        },
        disposeScene() {
          events.push('scene:dispose');
          throw new Error('scene cleanup failed');
        },
      }), (error: unknown) => error === setupError);
      assert.deepEqual(events, stage === 'add-listener'
        ? ['listener:add', 'listener:remove', 'presentation:dispose', 'scene:dispose']
        : ['listener:add', 'observer:observe', 'listener:remove', 'presentation:dispose', 'scene:dispose']);
    }
  });

  await t.test('Viewer mount treats a falsy thrown value as setup failure and preserves it exactly', () => {
    const events: string[] = [];
    const notCaught = Symbol('not caught');
    let caught: unknown = notCaught;
    try {
      createViewerMountLifecycle({
        addWindowResizeListener() { events.push('listener:add'); },
        removeWindowResizeListener() { events.push('listener:remove'); },
        resizeListener() {},
        observeResize() { events.push('observer:observe'); throw 0; },
        disposePresentation() { events.push('presentation:dispose'); },
        disposeScene() { events.push('scene:dispose'); },
      });
    } catch (error) {
      caught = error;
    }
    assert.equal(caught, 0, 'the exact falsy setup exception is rethrown');
    assert.deepEqual(events, [
      'listener:add', 'observer:observe', 'listener:remove',
      'presentation:dispose', 'scene:dispose',
    ]);
  });

  await t.test('real resize-observer wiring disconnects an acquired observer when observe throws', () => {
    const events: string[] = [];
    const observeError = new Error('observer.observe failed');
    assert.throws(() => observeElementResize(
      () => ({
        observe() { events.push('observer:observe'); throw observeError; },
        disconnect() { events.push('observer:disconnect'); throw new Error('disconnect failed'); },
      }),
      {} as Element,
      () => {},
    ), (error: unknown) => error === observeError);
    assert.deepEqual(events, ['observer:observe', 'observer:disconnect']);
  });

  await t.test('scene initialization failure disposes all resources once and preserves initialization error', () => {
    for (const stage of ['controls-listener', 'resize', 'first-raf'] as const) {
      const events: string[] = [];
      const initializationError = new Error(`${stage} initialization failed`);
      const lifecycle = createSceneResourceLifecycle({
        requestFrame() { events.push('raf:request'); throw initializationError; },
        cancelFrame() { events.push('raf:cancel'); throw new Error('cancel cleanup failed'); },
        renderFrame() { return false; },
        removeInvalidationListeners() { events.push('controls:listener:remove'); },
        clearMesh() { events.push('mesh:null'); throw new Error('mesh cleanup failed'); },
        disposeControls() { events.push('controls:dispose'); throw new Error('controls cleanup failed'); },
        disposeRenderer() { events.push('renderer:dispose'); throw new Error('renderer cleanup failed'); },
      });
      assert.throws(() => initializeSceneResourceLifecycle(lifecycle, () => {
        events.push('controls:listener:add');
        if (stage === 'controls-listener') throw initializationError;
        events.push('resize');
        if (stage === 'resize') throw initializationError;
        lifecycle.start();
      }), (error: unknown) => error === initializationError);
      const setupEvents = stage === 'controls-listener'
        ? ['controls:listener:add']
        : stage === 'resize'
          ? ['controls:listener:add', 'resize']
          : ['controls:listener:add', 'resize', 'raf:request'];
      assert.deepEqual(events, [
        ...setupEvents, 'controls:listener:remove', 'mesh:null',
        'controls:dispose', 'renderer:dispose',
      ]);
      assert.deepEqual(lifecycle.snapshot(), { disposed: true, running: false, frameRequest: null });
      assert.doesNotThrow(() => lifecycle.dispose(), 'failed initialization cleanup remains idempotent');
    }
  });

  await t.test('scene disposal continues after cancel, mesh, and controls cleanup errors', () => {
    const events: string[] = [];
    const cancelError = new Error('cancel failed');
    const lifecycle = createSceneResourceLifecycle({
      requestFrame() { events.push('raf:request'); return 7; },
      cancelFrame() { events.push('raf:cancel'); throw cancelError; },
      renderFrame() { return false; },
      clearMesh() { events.push('mesh:null'); throw new Error('mesh failed'); },
      disposeControls() { events.push('controls:dispose'); throw new Error('controls failed'); },
      disposeRenderer() { events.push('renderer:dispose'); },
    });
    lifecycle.start();
    assert.throws(() => lifecycle.dispose(), (error: unknown) => error === cancelError);
    assert.deepEqual(events, ['raf:request', 'raf:cancel', 'mesh:null', 'controls:dispose', 'renderer:dispose']);
    assert.doesNotThrow(() => lifecycle.dispose());
  });

  await t.test('App passes the frozen Built Part contract and no live file/transform/geometry props to Viewer', async () => {
    const source = await readFile(new URL('../../src/App.tsx', import.meta.url), 'utf8');
    const viewerTag = source.match(/<Viewer[\s\S]*?\/>/)?.[0];
    assert.ok(viewerTag, 'App must render Viewer');
    assert.match(viewerTag, /builtPart=\{state\.builtPart\}/);
    assert.doesNotMatch(viewerTag, /\bgeometry=/);
    assert.doesNotMatch(viewerTag, /\bfile=/);
    assert.doesNotMatch(viewerTag, /\bimageScale=/);
    assert.doesNotMatch(viewerTag, /\bflipHorizontal=/);
    assert.doesNotMatch(viewerTag, /\bflipVertical=/);
    assert.doesNotMatch(viewerTag, /\bpaddingMode=/);
    assert.match(source, /createAppBuildGate\(runCoordinator\)/, 'App must use the synchronous Build gate');
    assert.match(source, /buildGate\.invalidate\(\)/, 'new image/unmount must invalidate the App gate');
    assert.match(source, /buildEnabled=\{Boolean\(state\.file\).*state\.status !== 'generating'.*!state\.paramsError\}/s);
    assert.match(source, /exportEnabled=\{isExportReady\(state\)\}/);
  });

  await t.test('Controls keeps new-image selection available while generation disables the Build control group', async () => {
    const source = await readFile(new URL('../../src/components/Controls.tsx', import.meta.url), 'utf8');
    const fileInput = source.indexOf('type="file"');
    const generationDisabledGroup = source.indexOf('<fieldset disabled={disabled}');
    assert.ok(fileInput >= 0, 'Controls must render the source file input');
    assert.ok(generationDisabledGroup >= 0, 'Controls must retain a generation-disabled control group');
    assert.ok(fileInput < generationDisabledGroup, 'source selection must remain outside the disabled group');
    assert.match(source.slice(generationDisabledGroup), />\s*Build\s*</);
    assert.match(source.slice(generationDisabledGroup), />\s*Export STL\s*</);
  });
}
