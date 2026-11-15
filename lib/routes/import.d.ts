/**
 * 路由组：导入/导出流水线的传输与运行阶段（download / upload / decrypt-archive / execute / execute-skip / progress / runs）。
 *
 * W1（host-entry#F-02/#F-03）：路由只在这里声明一次 —— endpoint({ path, methods }, handler) 的
 * path/methods 就是唯一声明处；围栏、方法判定与顶层异常处理由 src/routes/kit.ts 在注册点统一提供。
 */
import type { WebRoute } from './kit.ts';
import type { RoutesEnv } from './context.ts';
/**
 * 该路径是否是 /decrypt-archive 解出的**明文备份副本**（e2e-F2「用完即清」的对象）。
 *
 * 判据 = 落在受控 tmpDir 内 + basename 以 `decrypted-` 开头（该前缀全仓只有本文件使用）。
 * 不依赖进程内台账：宿主重启后接续导入的明文同样应被清掉；暂存上传（upload-…）与市场暂存
 * （market-… 与 publish-…）不是「明文副本」语义，由 tmpDir 的保留期清理兜底，不在本函数范围。
 */
export declare function isDecryptedPlaintextArtifact(zipPath: string, tmpDir: string): boolean;
export declare function importRoutes(env: RoutesEnv): WebRoute[];
