export type PeopleScope = "people" | "daikao";

export function personApi(scope: PeopleScope, path: string) {
  const base = scope === "daikao" ? "/api/daikao" : "/api/people";
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return `${base}${suffix}`;
}

export function personPage(
  scope: PeopleScope,
  id: number,
  kind: "lineage" | "yizi",
) {
  const base = scope === "daikao" ? "/daikao" : "/people";
  return `${base}/${id}/${kind}`;
}

export function personListHref(scope: PeopleScope) {
  return scope === "daikao" ? "/daikao" : "/people";
}

export function objectTypeOf(scope: PeopleScope) {
  return scope === "daikao" ? "daikao" : "people";
}
