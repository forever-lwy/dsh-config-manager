export interface BundlePatchLayer {
    name: string;
    patches: readonly unknown[];
}
export interface BundleReconciliation {
    removed: {
        name: string;
        coveredBy: string;
    }[];
}
export declare function reconcileBundleLayers(layers: readonly BundlePatchLayer[]): BundleReconciliation;
