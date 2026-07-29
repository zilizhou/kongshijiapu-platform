"use client";

import Link from "next/link";
import { AnchorHTMLAttributes, ReactNode, useEffect, useState } from "react";
import { peopleListHref } from "@/lib/people-list-query";

/** 返回家谱成员列表，并恢复离开前的查询条件 */
export function PeopleListBackLink({
  children,
  className,
  ...rest
}: {
  children: ReactNode;
  className?: string;
} & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href">) {
  const [href, setHref] = useState("/people");
  useEffect(() => {
    setHref(peopleListHref());
  }, []);
  return (
    <Link href={href} className={className} {...rest}>
      {children}
    </Link>
  );
}
