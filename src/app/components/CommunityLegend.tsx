import React from "react";
import { Box, Typography } from "@mui/material";
import { Community } from "../models/community";
import { communityColor } from "../utils/community-utils";

interface CommunityLegendProps {
  communities: Community[];
  focusedId: string | null;
  disabled: boolean;
  onSelect: (community: Community) => void;
}

// Sorted by size so the communities that dominate the picture come first.
const CommunityLegend: React.FC<CommunityLegendProps> = ({
  communities,
  focusedId,
  disabled,
  onSelect,
}) => {
  const sorted = [...communities].sort(
    (a, b) => (b.size ?? 0) - (a.size ?? 0) || a.community - b.community
  );
  return (
    <Box sx={{ width: 260, maxHeight: "30vh", overflowY: "auto", pr: 1 }}>
      <Typography variant="body2" gutterBottom>
        Communities: {communities.length} (click to focus)
      </Typography>
      {sorted.map((community) => {
        const id = community.id.toString();
        const focused = focusedId === id;
        return (
          <Box
            key={id}
            onClick={() => !disabled && onSelect(community)}
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1,
              py: 0.25,
              cursor: disabled ? "default" : "pointer",
              opacity: disabled ? 0.5 : 1,
            }}
          >
            <Box
              sx={{
                width: 12,
                height: 12,
                flexShrink: 0,
                borderRadius: "2px",
                bgcolor: communityColor(community.community),
              }}
            />
            <Typography
              variant="caption"
              noWrap
              title={community.title}
              sx={{ flex: 1, fontWeight: focused ? 700 : 400 }}
            >
              L{community.level} · {community.title}
            </Typography>
            <Typography variant="caption" sx={{ color: "text.secondary" }}>
              {community.size}
            </Typography>
          </Box>
        );
      })}
    </Box>
  );
};

export default CommunityLegend;
