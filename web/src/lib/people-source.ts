/** 成员数据来源：导入底库 vs 本平台新录（依据 F_CREATE_ADMIN） */

export type PeopleDataSource = "legacy" | "platform";

export function resolvePeopleDataSource(input: {
  createAdmin?: string | null;
}): PeopleDataSource {
  return (input.createAdmin || "").trim() === "platform" ? "platform" : "legacy";
}

export function peopleDataSourceLabel(src: PeopleDataSource): string {
  return src === "platform" ? "新录入" : "旧谱底库";
}

export function peopleDataSourceHint(src: PeopleDataSource): string {
  return src === "platform"
    ? "本平台审核通过后写入"
    : "历史谱籍导入底库（无逐条录入年份）";
}
