declare module "element-china-area-data" {
  export type CascaderOption = {
    value: string;
    label: string;
    children?: CascaderOption[];
  };
  export const regionData: CascaderOption[];
  export const provinceAndCityData: CascaderOption[];
  export const codeToText: Record<string, string>;
  export const pcaTextArr: string[][];
  export const pcTextArr: string[][];
}
