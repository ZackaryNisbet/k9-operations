import React from "react";
import { I } from "../../../shared/icons";
import { getLinkHost, getProductHref } from "./productLinks";

export function ProductReferenceCard({ product }) {
  const href = getProductHref(product);
  return (
    <article className={href ? "product-reference-card linked" : "product-reference-card"}>
      <div className="product-reference-main">
        <strong>{product.name}</strong>
        <span>{product.quantity || (href ? getLinkHost(href) : "No link added")}</span>
      </div>
      {href ? (
        <a className="product-reference-action" href={href} target="_blank" rel="noreferrer" aria-label={`Open ${product.name}`}>
          <I.Link />
          <span>Open</span>
        </a>
      ) : null}
    </article>
  );
}

export function ProductLinksInline({ products = [] }) {
  if (!products.length) return <span>No products listed</span>;
  return (
    <div className="product-inline-links">
      {products.map((product, index) => {
        const href = getProductHref(product);
        if (!href) return <span key={`${product.name}_${index}`} className="product-text">{product.name}</span>;
        return (
          <a key={`${product.name}_${index}`} href={href} target="_blank" rel="noreferrer">
            <I.Link />
            <span>{product.name}</span>
          </a>
        );
      })}
    </div>
  );
}
