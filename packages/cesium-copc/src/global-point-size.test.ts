import {
  BoundingSphere,
  BufferPointCollection,
  Cartesian3,
  ComponentDatatype,
  Matrix4,
} from "cesium";
import { describe, expect, it } from "vitest";
import { installGlobalPointSize, type GlobalPointSize } from "./global-point-size.js";

interface ShaderProgramStub {
  readonly options: {
    readonly vertexShaderSource: { readonly defines: string[] };
    readonly attributeLocations: Readonly<Record<string, number>>;
  };
  destroyed: boolean;
  destroy(): void;
}

interface RenderContextStub {
  shaderProgram?: { destroy(): void };
  command?: {
    shaderProgram: unknown;
    uniformMap: Record<string, () => number> | undefined;
  };
  globalPointSize?: GlobalPointSize;
  /** Cesium destroys the render context when the collection is destroyed. */
  destroy(): void;
}

function contextStub() {
  const programs: ShaderProgramStub[] = [];
  const context = {
    shaderCache: {
      getShaderProgram(options: ShaderProgramStub["options"]): ShaderProgramStub {
        const program: ShaderProgramStub = {
          options,
          destroyed: false,
          destroy() {
            program.destroyed = true;
          },
        };
        programs.push(program);
        return program;
      },
    },
  };
  return { context, programs };
}

function createCollection(positionDatatype: number): BufferPointCollection {
  return new BufferPointCollection({
    primitiveCountMax: 1,
    positionDatatype,
    modelMatrix: Matrix4.clone(Matrix4.IDENTITY),
    boundingVolume: new BoundingSphere(Cartesian3.clone(Cartesian3.ZERO), 1),
    allowPicking: false,
  } as ConstructorParameters<typeof BufferPointCollection>[0]);
}

/** Stands in for the render state Cesium creates on the first draw. */
function attachRenderContext(collection: BufferPointCollection): RenderContextStub {
  const renderContext: RenderContextStub = {
    command: { shaderProgram: undefined, uniformMap: undefined },
    destroy() {},
  };
  (collection as unknown as { _renderContext: RenderContextStub })._renderContext = renderContext;
  return renderContext;
}

describe("installGlobalPointSize", () => {
  it("defers until the collection has issued a draw command", () => {
    const { context, programs } = contextStub();
    const collection = createCollection(ComponentDatatype.FLOAT);
    const pointSize: GlobalPointSize = { value: 2 };

    expect(installGlobalPointSize(collection, context, pointSize)).toBe(false);

    (collection as unknown as { _renderContext: RenderContextStub })._renderContext = {
      destroy() {},
    };
    expect(installGlobalPointSize(collection, context, pointSize)).toBe(false);
    expect(programs).toHaveLength(0);

    collection.destroy();
  });

  it("routes the draw command through a uniform that follows the live value", () => {
    const { context, programs } = contextStub();
    const collection = createCollection(ComponentDatatype.FLOAT);
    const renderContext = attachRenderContext(collection);
    const pointSize: GlobalPointSize = { value: 2 };

    expect(installGlobalPointSize(collection, context, pointSize)).toBe(true);
    expect(programs).toHaveLength(1);
    expect(renderContext.command?.shaderProgram).toBe(programs[0]);
    expect(renderContext.shaderProgram).toBe(programs[0]);
    expect(renderContext.command?.uniformMap?.u_pointSize?.()).toBe(2);

    pointSize.value = 7.5;
    expect(renderContext.command?.uniformMap?.u_pointSize?.()).toBe(7.5);

    collection.destroy();
  });

  it("compiles once per binding instead of on every frame", () => {
    const { context, programs } = contextStub();
    const collection = createCollection(ComponentDatatype.FLOAT);
    attachRenderContext(collection);
    const pointSize: GlobalPointSize = { value: 3 };

    expect(installGlobalPointSize(collection, context, pointSize)).toBe(true);
    expect(installGlobalPointSize(collection, context, pointSize)).toBe(true);
    expect(programs).toHaveLength(1);

    collection.destroy();
  });

  it("destroys the superseded shader program when the binding changes", () => {
    const { context, programs } = contextStub();
    const collection = createCollection(ComponentDatatype.FLOAT);
    const renderContext = attachRenderContext(collection);

    installGlobalPointSize(collection, context, { value: 3 });
    installGlobalPointSize(collection, context, { value: 4 });

    expect(programs).toHaveLength(2);
    expect(programs[0]?.destroyed).toBe(true);
    expect(programs[1]?.destroyed).toBe(false);
    expect(renderContext.shaderProgram).toBe(programs[1]);

    collection.destroy();
  });

  it("selects the shader variant matching the position datatype", () => {
    const { context, programs } = contextStub();

    const float32 = createCollection(ComponentDatatype.FLOAT);
    attachRenderContext(float32);
    installGlobalPointSize(float32, context, { value: 2 });

    const float64 = createCollection(ComponentDatatype.DOUBLE);
    attachRenderContext(float64);
    installGlobalPointSize(float64, context, { value: 2 });

    expect(programs[0]?.options.vertexShaderSource.defines).toEqual([]);
    expect(programs[0]?.options.attributeLocations).toMatchObject({ position: 0 });
    expect(programs[1]?.options.vertexShaderSource.defines).toEqual(["USE_FLOAT64"]);
    expect(programs[1]?.options.attributeLocations).toMatchObject({
      positionHigh: 0,
      positionLow: 1,
    });

    float32.destroy();
    float64.destroy();
  });
});
