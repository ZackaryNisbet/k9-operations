import React from "react";
import { Badge } from "../../../../shared/ui";
import { getInterviewRecommendationOption } from "../../../interviewData";

export function RecommendationBadge({ value }) {
  const option = getInterviewRecommendationOption(value);
  return <Badge color={option.tone}>{option.label}</Badge>;
}
