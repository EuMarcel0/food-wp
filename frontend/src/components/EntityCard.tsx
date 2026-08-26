import type { ReactNode } from "react";

export function EntityCard({
  kicker,
  title,
  extra,
  children,
  footer,
  tone,
}: {
  kicker?: ReactNode;
  title: ReactNode;
  extra?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  tone?: string;
}) {
  return (
    <article className="entity-card" data-tone={tone || undefined}>
      <div className="entity-card-top">
        <div className="entity-card-heading">
          {kicker ? <span className="entity-card-kicker">{kicker}</span> : null}
          <h4 className="entity-card-title">{title}</h4>
        </div>
        {extra ? <div className="entity-card-extra">{extra}</div> : null}
      </div>
      {children ? <div className="entity-card-body">{children}</div> : null}
      {footer ? <div className="entity-card-footer">{footer}</div> : null}
    </article>
  );
}
