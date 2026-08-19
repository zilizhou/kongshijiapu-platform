"use client";

import Link from "next/link";
import { AnchorHTMLAttributes, ReactNode, useEffect, useState } from "react";
import { peopleListHref } from "@/lib/people-list-query";

/** 返回家谱成员列表，并恢复离开前的查询条件 */
export function PeopleListBackLink({
  children,
  className,
  listHref,
  ...rest
}: {
  children: ReactNode;
  className?: string;
  /** 指定返回列表地址（如待考支 /daikao）；默认恢复家谱列表查询条件 */
  listHref?: string;
} & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href">) {
  const [href, setHref] = useState(listHref || "/people");
  useEffect(() => {
    if (listHref) {
      setHref(listHref);
      return;
    }
    setHref(peopleListHref());
  }, [listHref]);
  return (
    <Link href={href} className={className} {...rest}>
      {children}
    </Link>
  );
}
