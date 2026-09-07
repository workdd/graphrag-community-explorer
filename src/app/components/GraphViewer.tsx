import React, {
  useState,
  useCallback,
  useRef,
  useEffect,
  useMemo,
} from "react";
import ForceGraph2D from "react-force-graph-2d";
import ForceGraph3D from "react-force-graph-3d";
import {
  CustomGraphData,
  CustomLink,
  CustomNode,
} from "../models/custom-graph-data";
import {
  Box,
  Button,
  Checkbox,
  Chip,
  FormControlLabel,
  FormGroup,
  IconButton,
  Slider,
  Switch,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
  useTheme,
} from "@mui/material";
import FullscreenIcon from "@mui/icons-material/Fullscreen";
import FullscreenExitIcon from "@mui/icons-material/FullscreenExit";
import SearchIcon from "@mui/icons-material/Search";
import DeleteIcon from "@mui/icons-material/Delete";
import Fuse from "fuse.js";
import {
  CSS2DRenderer,
  CSS2DObject,
} from "three/examples/jsm/renderers/CSS2DRenderer";
import * as THREE from "three";
import { Renderer } from "three";
import SearchDrawer from "./SearchDrawer";
import DetailDrawer from "./DetailDrawer";
import { SearchResult } from "../models/search-result";
import agent from "../api/agent";
import APISearchDrawer from "./APISearchDrawer";
import SpriteText from "three-spritetext";
import CommunityLegend from "./CommunityLegend";
import { Community } from "../models/community";
import {
  UNCLUSTERED_COLOR,
  communityColor,
  communityNodeVal,
  focusCommunity,
  typeColor,
} from "../utils/community-utils";

type Coords = {
  x: number;
  y: number;
  z: number;
};

interface GraphViewerProps {
  data: CustomGraphData;
  graphType: "2d" | "3d";
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  onToggleGraphType: (event: React.ChangeEvent<HTMLInputElement>) => void;
  includeDocuments: boolean;
  onIncludeDocumentsChange: React.Dispatch<React.SetStateAction<boolean>>;
  includeTextUnits: boolean;
  onIncludeTextUnitsChange: React.Dispatch<React.SetStateAction<boolean>>;
  includeCommunities: boolean;
  onIncludeCommunitiesChange: React.Dispatch<React.SetStateAction<boolean>>;
  includeCovariates: boolean;
  onIncludeCovariatesChange: React.Dispatch<React.SetStateAction<boolean>>;
  hasDocuments: boolean;
  hasTextUnits: boolean;
  hasCommunities: boolean;
  hasCovariates: boolean;
  maxEntities: number;
  onMaxEntitiesChange: React.Dispatch<React.SetStateAction<number>>;
  totalEntities: number;
  communities: Community[];
  communityLevels: number[];
  communityLevel: number | null;
  onCommunityLevelChange: (level: number | null) => void;
  hideUnclustered: boolean;
  onHideUnclusteredChange: React.Dispatch<React.SetStateAction<boolean>>;
  initialCommunity?: Community | null;
}

const NODE_R = 8;

const GraphViewer: React.FC<GraphViewerProps> = ({
  data,
  graphType,
  isFullscreen,
  includeDocuments,
  onIncludeDocumentsChange,
  includeTextUnits,
  onIncludeTextUnitsChange,
  includeCommunities,
  onIncludeCommunitiesChange,
  includeCovariates,
  onIncludeCovariatesChange,
  onToggleFullscreen,
  onToggleGraphType,
  hasDocuments,
  hasTextUnits,
  hasCommunities,
  hasCovariates,
  maxEntities,
  onMaxEntitiesChange,
  totalEntities,
  communities,
  communityLevels,
  communityLevel,
  onCommunityLevelChange,
  hideUnclustered,
  onHideUnclusteredChange,
  initialCommunity,
}) => {
  const theme = useTheme();
  const [highlightNodes, setHighlightNodes] = useState<Set<CustomNode>>(
    new Set()
  );
  const [highlightLinks, setHighlightLinks] = useState<Set<CustomLink>>(
    new Set()
  );
  const [hoverNode, setHoverNode] = useState<CustomNode | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState<
    (CustomNode | CustomLink)[]
  >([]);
  const [rightDrawerOpen, setRightDrawerOpen] = useState(false);
  const [bottomDrawerOpen, setBottomDrawerOpen] = useState(false);
  const [selectedNode, setSelectedNode] = useState<CustomNode | null>(null);
  const [selectedRelationship, setSelectedRelationship] =
    useState<CustomLink | null>(null);
  const [linkedNodes, setLinkedNodes] = useState<CustomNode[]>([]);
  const [linkedRelationships, setLinkedRelationships] = useState<CustomLink[]>(
    []
  );
  const [showLabels, setShowLabels] = useState(true);
  const [showLinkLabels, setShowLinkLabels] = useState(false);
  const [showHighlight, setShowHighlight] = useState(true);
  const [colorByCommunity, setColorByCommunity] = useState(false);
  const [focusedCommunity, setFocusedCommunity] = useState<Community | null>(
    null
  );
  const graphRef = useRef<any>();
  const nodePositions = useRef(new Map<string, { x: number; y: number; z?: number }>());
  const communityDragState = useRef(new Map<string, { x: number; y: number; z?: number }>());
  const extraRenderers = [new CSS2DRenderer() as any as Renderer];

  const [apiDrawerOpen, setApiDrawerOpen] = useState(false);
  const [apiSearchResults, setApiSearchResults] = useState<SearchResult | null>(
    null
  );
  const [serverUp, setServerUp] = useState<boolean>(false);

  const [graphData, setGraphData] = useState<CustomGraphData>(data);

  const initialGraphData = useRef<CustomGraphData>(data);
  const communityMode = colorByCommunity && communities.length > 0;
  const typeIndex = useMemo(
    () =>
      new Map(
        [...new Set(data.nodes.map((n) => n.type))]
          .sort()
          .map((t, i) => [t, i] as [string, number])
      ),
    [data]
  );
  // Count what is drawn (focus / query results), not the full dataset.
  const nodeCount = graphData.nodes.length;
  const linkCount = graphData.links.length;

  useEffect(() => {
    // Restore positions from the user's previous layout whenever the data
    // object is rebuilt by a filter/focus action.
    data.nodes.forEach((node) => {
      const saved = nodePositions.current.get(node.uuid || node.id);
      if (saved) {
        node.x = saved.x;
        node.y = saved.y;
        if (saved.z != null) node.z = saved.z;
      }
    });
    setGraphData(data);
    initialGraphData.current = data;
    setFocusedCommunity(null);
  }, [data]);

  const rememberNodePosition = useCallback((node: CustomNode) => {
    if (node.x == null || node.y == null) return;
    nodePositions.current.set(node.uuid || node.id, { x: node.x, y: node.y, z: node.z });
  }, []);

  const moveCommunity = useCallback((node: CustomNode) => {
    if (node.type !== "COMMUNITY" || node.x == null || node.y == null) return;
    const community = communities.find((c) => c.id.toString() === node.id);
    if (!community) return;
    const key = community.id.toString();
    const previous = communityDragState.current.get(key) ?? { x: node.x, y: node.y, z: node.z };
    const dx = node.x - previous.x;
    const dy = node.y - previous.y;
    const dz = (node.z ?? 0) - (previous.z ?? 0);
    const memberIds = new Set(community.entity_ids ?? []);
    graphData.nodes.forEach((member) => {
      if (!memberIds.has(member.uuid) || member.x == null || member.y == null) return;
      member.x += dx;
      member.y += dy;
      if (member.z != null) member.z += dz;
    });
    communityDragState.current.set(key, { x: node.x, y: node.y, z: node.z });
  }, [communities, graphData.nodes]);

  const finishCommunityDrag = useCallback((node: CustomNode) => {
    if (node.type === "COMMUNITY") {
      const community = communities.find((c) => c.id.toString() === node.id);
      if (community) {
        community.entity_ids?.forEach((id) => {
          const member = graphData.nodes.find((candidate) => candidate.uuid === id);
          if (member) rememberNodePosition(member);
        });
      }
      communityDragState.current.delete(node.id);
    }
    rememberNodePosition(node);
  }, [communities, graphData.nodes, rememberNodePosition]);

  useEffect(() => {
    if (initialCommunity && data.nodes.length > 0) {
      setFocusedCommunity(initialCommunity);
      setGraphData(focusCommunity(initialGraphData.current, initialCommunity.id.toString(), initialCommunity.entity_ids ?? []));
      setTimeout(() => graphRef.current?.zoomToFit(600, 60), 500);
    }
  }, [initialCommunity, data.nodes.length]);

  // Give labels room to breathe. ForceGraph exposes the underlying d3
  // simulation; a stronger repulsion and longer links reduce text collisions
  // substantially for the readable, presentation-oriented view.
  useEffect(() => {
    const simulation = graphRef.current;
    if (!simulation || graphType !== "2d") return;
    simulation.d3Force("charge")?.strength(-420);
    simulation.d3Force("link")?.distance(125);
    const levelForce: any = (alpha: number) => {
      const nodes = levelForce.nodes || [];
      nodes.forEach((node: CustomNode) => {
        const level = node.type === "COMMUNITY" ? node.level :
          (node.community_ids?.length ? (communities.find((c) => c.id.toString() === node.community_ids?.[0])?.level ?? 0) : 0);
        if (node.y == null || level == null) return;
        const target = 140 + Number(level) * 260;
        node.vy = (node.vy ?? 0) + (target - node.y) * 0.09 * alpha;
      });
    };
    levelForce.initialize = (nodes: CustomNode[]) => { levelForce.nodes = nodes; };
    simulation.d3Force("level", levelForce);
    simulation.d3ReheatSimulation?.();
  }, [graphType, graphData.nodes.length, graphData.links.length, communities]);

  useEffect(() => {
    checkServerStatus();
  }, []);

  const toggleApiDrawer = (open: boolean) => () => {
    setApiDrawerOpen(open);
  };

  const handleApiSearch = async (
    query: string,
    searchType: "local" | "global"
  ) => {
    try {
      const data: SearchResult =
        searchType === "local"
          ? await agent.Search.local(query)
          : await agent.Search.global(query);

      setApiSearchResults(data);
      // Process the search result to update the graph data
      updateGraphData(data.context_data);
    } catch (err) {
      console.error("An error occurred during the API search.", err);
    } finally {
    }
  };

  const checkServerStatus = async () => {
    try {
      const response = await agent.Status.check();
      if (response.status === "Server is up and running") {
        setServerUp(true);
      } else {
        setServerUp(false);
      }
    } catch (error) {
      setServerUp(false);
    }
  };

  const updateGraphData = (contextData: any) => {
    if (!contextData) return;

    const newNodes: CustomNode[] = [];
    const newLinks: CustomLink[] = [];

    const baseGraphData = initialGraphData.current;

    // Assuming contextData has keys like entities, reports, relationships, sources
    Object.entries(contextData).forEach(([key, items]) => {
      if (Array.isArray(items)) {
        items.forEach((item) => {
          if (key === "relationships") {
            // Handle links
            const existingLink = baseGraphData.links.find(
              (link) =>
                link.human_readable_id?.toString() === item.id.toString()
            );

            if (existingLink) {
              newLinks.push(existingLink);
            }
          } else if (key === "entities") {
            const existingNode = baseGraphData.nodes.find(
              (node) =>
                node.human_readable_id?.toString() === item.id.toString() &&
                !node.covariate_type
            );
            if (existingNode) {
              newNodes.push(existingNode);
            }
          } else if (key === "reports") {
            const existingNode = baseGraphData.nodes.find(
              (node) => node.uuid === item.id.toString()
            );
            if (existingNode) {
              newNodes.push(existingNode);
            }
          } else if (key === "sources") {
            const existingNode = baseGraphData.nodes.find(
              (node) => node.text?.toString() === item.text
            );
            if (existingNode) {
              newNodes.push(existingNode);
            }
          } else if (key === "covariates" || key === "claims") {
            const existingNode = baseGraphData.nodes.find(
              (node) =>
                node.human_readable_id?.toString() === item.id.toString() &&
                node.covariate_type
            );
            if (existingNode) {
              newNodes.push(existingNode);
            }
          }
        });
      }
    });

    // Update the graph data with the new nodes and links
    const updatedGraphData: CustomGraphData = {
      nodes: [...newNodes],
      links: [...newLinks],
    };

    // Set the updated data to trigger re-render
    setGraphData(updatedGraphData);
  };

  const fuse = new Fuse([...data.nodes, ...data.links], {
    keys: [
      "uuid",
      "id",
      "name",
      "type",
      "description",
      "source",
      "target",
      "title",
      "summary",
    ],
    threshold: 0.3,
  });

  const handleNodeHover = useCallback((node: CustomNode | null) => {
    const newHighlightNodes = new Set<CustomNode>();
    const newHighlightLinks = new Set<CustomLink>();

    if (node) {
      newHighlightNodes.add(node);
      node.neighbors?.forEach((neighbor) => newHighlightNodes.add(neighbor));
      node.links?.forEach((link) => newHighlightLinks.add(link));
    }

    setHighlightNodes(newHighlightNodes);
    setHighlightLinks(newHighlightLinks);
    setHoverNode(node);
  }, []);

  const handleLinkHover = useCallback((link: CustomLink | null) => {
    const newHighlightNodes = new Set<CustomNode>();
    const newHighlightLinks = new Set<CustomLink>();

    if (link) {
      newHighlightLinks.add(link);
      if (typeof link.source !== "string") newHighlightNodes.add(link.source);
      if (typeof link.target !== "string") newHighlightNodes.add(link.target);
    }

    setHighlightNodes(newHighlightNodes);
    setHighlightLinks(newHighlightLinks);
  }, []);

  const paintRing = useCallback(
    (node: CustomNode, ctx: CanvasRenderingContext2D) => {
      ctx.beginPath();
      const radius = NODE_R * Math.sqrt(communityNodeVal(node));
      ctx.arc(node.x!, node.y!, radius * 1.4, 0, 2 * Math.PI, false);
      if (highlightNodes.has(node)) {
        ctx.fillStyle = node === hoverNode ? "red" : "orange";
        ctx.globalAlpha = 1; // full opacity
      } else {
        ctx.fillStyle = "gray";
        ctx.globalAlpha = 0.3; // reduced opacity for non-highlighted nodes
      }
      ctx.fill();
      ctx.globalAlpha = 1; // reset alpha for other drawings
    },
    [hoverNode, highlightNodes]
  );

  const handleSearch = () => {
    const results = fuse.search(searchTerm).map((result) => result.item);
    const nodeResults = results.filter((item) => "neighbors" in item);
    const linkResults = results.filter(
      (item) => "source" in item && "target" in item
    );
    setSearchResults([...nodeResults, ...linkResults]);
    setRightDrawerOpen(true);
  };

  const toggleDrawer = (open: boolean) => () => {
    setRightDrawerOpen(open);
  };

  const handleFocusButtonClick = (node: CustomNode) => {
    const newHighlightNodes = new Set<CustomNode>();
    newHighlightNodes.add(node);
    node.neighbors?.forEach((neighbor) => newHighlightNodes.add(neighbor));
    node.links?.forEach((link) => highlightLinks.add(link));

    setHighlightNodes(newHighlightNodes);
    setHoverNode(node);

    if (graphRef.current) {
      if (graphType === "2d") {
        graphRef.current.centerAt(node.x, node.y, 1000);
        graphRef.current.zoom(8, 1000);
      } else {
        graphRef.current.cameraPosition(
          { x: node.x, y: node.y, z: 300 }, // new position
          { x: node.x, y: node.y, z: 0 }, // lookAt
          3000 // ms transition duration
        );
      }
    }

    // Simulate mouse hover on the focused node
    setTimeout(() => {
      handleNodeHover(node);
    }, 1000); // Adjust delay as needed

    setRightDrawerOpen(false);
  };

  const handleFocusLinkClick = (link: CustomLink) => {
    const newHighlightNodes = new Set<CustomNode>();
    const newHighlightLinks = new Set<CustomLink>();

    newHighlightLinks.add(link);
    let sourceNode: CustomNode | undefined;
    let targetNode: CustomNode | undefined;

    if (typeof link.source !== "string") {
      newHighlightNodes.add(link.source);
      sourceNode = link.source;
    }

    if (typeof link.target !== "string") {
      newHighlightNodes.add(link.target);
      targetNode = link.target;
    }

    setHighlightNodes(newHighlightNodes);
    setHighlightLinks(newHighlightLinks);

    if (
      graphRef.current &&
      sourceNode &&
      targetNode &&
      sourceNode.x &&
      targetNode.x &&
      sourceNode.y &&
      targetNode.y
    ) {
      const midX = (sourceNode.x + targetNode.x) / 2;
      const midY = (sourceNode.y + targetNode.y) / 2;

      if (graphType === "2d") {
        graphRef.current.centerAt(midX, midY, 1000);
        graphRef.current.zoom(8, 1000);
      } else {
        graphRef.current.cameraPosition(
          { x: midX, y: midY, z: 300 }, // new position
          { x: midX, y: midY, z: 0 }, // lookAt
          3000 // ms transition duration
        );
      }
    }

    // Simulate mouse hover on the focused link
    setTimeout(() => {
      handleLinkHover(link);
    }, 1000); // Adjust delay as needed

    setRightDrawerOpen(false);
  };

  const handleNodeClick = (node: CustomNode) => {
    setSelectedRelationship(null);
    setSelectedNode(node);
    setLinkedNodes(node.neighbors || []);
    setLinkedRelationships(node.links || []);
    setBottomDrawerOpen(true);
  };

  const handleLinkClick = (link: CustomLink) => {
    setSelectedNode(null);
    setSelectedRelationship(link);
    const linkSource =
      typeof link.source === "object"
        ? (link.source as CustomNode).id
        : link.source;
    const linkTarget =
      typeof link.target === "object"
        ? (link.target as CustomNode).id
        : link.target;
    const sourceNode = data.nodes.find((node) => node.id === linkSource);
    const targetNode = data.nodes.find((node) => node.id === linkTarget);
    if (sourceNode && targetNode) {
      const linkedNodes = [sourceNode, targetNode];
      setLinkedNodes(linkedNodes);
      const linkedRelationships = [link];
      setLinkedRelationships(linkedRelationships);
      setBottomDrawerOpen(true);
    }
  };

  const getBackgroundColor = () =>
    theme.palette.mode === "dark" ? "#000000" : "#FFFFFF";

  const getLinkColor = (link: CustomLink) =>
    theme.palette.mode === "dark" ? "gray" : "lightgray";

  const get3DLinkColor = (link: CustomLink) =>
    theme.palette.mode === "dark" ? "lightgray" : "gray";

  const getlinkDirectionalParticleColor = (link: CustomLink) =>
    theme.palette.mode === "dark" ? "lightgray" : "gray";

  // The viewer owns both palettes: force-graph skips its auto colouring
  // whenever nodeColor is a function, so it cannot be relied on to fill in.
  const getNodeColor = (node: CustomNode): string => {
    if (!includeCommunities && node.type === "COMMUNITY") return "rgba(0,0,0,0)";
    if (
      communityMode &&
      (node.type === "COMMUNITY" || Array.isArray(node.community_ids))
    ) {
      return node.community_number !== undefined
        ? communityColor(node.community_number)
        : UNCLUSTERED_COLOR;
    }
    return typeColor(typeIndex.get(node.type) ?? 0);
  };

  const renderNodeLabel = (node: CustomNode, ctx: CanvasRenderingContext2D) => {
    if (!includeCommunities && node.type === "COMMUNITY") return;
    if (!showLabels) return; // Only render the label if showLabels is true

    const rawLabel = node.name || node.id || "";
    const label = rawLabel.length > 26 ? `${rawLabel.slice(0, 24)}…` : rawLabel;
    const fontSize = 5;
    const padding = 2;
    ctx.font = `${fontSize}px Sans-Serif`;

    // Set the styles based on the theme mode
    const backgroundColor =
      theme.palette.mode === "dark"
        ? "rgba(0, 0, 0, 0.6)"
        : "rgba(255, 255, 255, 0.6)";

    // Calculate label dimensions
    const textWidth = ctx.measureText(label).width;
    const boxWidth = textWidth + padding * 2;
    const boxHeight = fontSize + padding * 2;

    if (node.x && node.y) {
      // Draw the background rectangle with rounded corners
      ctx.fillStyle = backgroundColor;
      ctx.beginPath();
      ctx.moveTo(node.x - boxWidth / 2 + 5, node.y - boxHeight / 2);
      ctx.lineTo(node.x + boxWidth / 2 - 5, node.y - boxHeight / 2);
      ctx.quadraticCurveTo(
        node.x + boxWidth / 2,
        node.y - boxHeight / 2,
        node.x + boxWidth / 2,
        node.y - boxHeight / 2 + 5
      );
      ctx.lineTo(node.x + boxWidth / 2, node.y + boxHeight / 2 - 5);
      ctx.quadraticCurveTo(
        node.x + boxWidth / 2,
        node.y + boxHeight / 2,
        node.x + boxWidth / 2 - 5,
        node.y + boxHeight / 2
      );
      ctx.lineTo(node.x - boxWidth / 2 + 5, node.y + boxHeight / 2);
      ctx.quadraticCurveTo(
        node.x - boxWidth / 2,
        node.y + boxHeight / 2,
        node.x - boxWidth / 2,
        node.y + boxHeight / 2 - 5
      );
      ctx.lineTo(node.x - boxWidth / 2, node.y - boxHeight / 2 + 5);
      ctx.quadraticCurveTo(
        node.x - boxWidth / 2,
        node.y - boxHeight / 2,
        node.x - boxWidth / 2 + 5,
        node.y - boxHeight / 2
      );
      ctx.closePath();
      ctx.fill();

      // Draw the text in the center of the node
      // ctx.fillStyle = textColor;
      ctx.fillStyle = getNodeColor(node);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(label, node.x, node.y);
    }
  };

  const nodeThreeObject = (node: CustomNode) => {
    if (!showLabels) {
      return new THREE.Object3D();
    }

    try {
      const nodeEl = document.createElement("div");
      const rawLabel = node.name || node.id;
      nodeEl.textContent = rawLabel.length > 32 ? `${rawLabel.slice(0, 30)}…` : rawLabel;
      nodeEl.style.color = theme.palette.text.primary;
      nodeEl.style.background = theme.palette.mode === "dark" ? "rgba(15,23,42,.9)" : "rgba(255,255,255,.92)";
      nodeEl.style.border = `2px solid ${getNodeColor(node)}`;
      nodeEl.style.maxWidth = "180px";
      nodeEl.style.whiteSpace = "nowrap";
      nodeEl.style.overflow = "hidden";
      nodeEl.style.textOverflow = "ellipsis";
      nodeEl.style.padding = "2px 4px";
      nodeEl.style.borderRadius = "4px";
      nodeEl.style.fontSize = "10px";
      nodeEl.className = "node-label";

      return new CSS2DObject(nodeEl);
    } catch (error) {
      console.error("Error creating 3D object:", error);
      return new THREE.Object3D(); // Fallback in case of error
    }
  };

  const localSearchEnabled = hasCovariates
    ? includeTextUnits && includeCommunities && includeCovariates
    : includeTextUnits && includeCommunities;

  const clearSearchResults = () => {
    setGraphData(initialGraphData.current);
    setApiSearchResults(null);
    setFocusedCommunity(null);
  };

  const fitAfterLayout = () =>
    setTimeout(() => graphRef.current?.zoomToFit(600, 120), 800);

  const applyCommunityFocus = (community: Community) => {
    setFocusedCommunity(community);
    setGraphData(
      focusCommunity(
        initialGraphData.current,
        community.id.toString(),
        community.entity_ids ?? []
      )
    );
    setBottomDrawerOpen(false);
    fitAfterLayout();
  };

  const clearCommunityFocus = () => {
    setFocusedCommunity(null);
    setGraphData(initialGraphData.current);
    fitAfterLayout();
  };

  const paintCommunityClouds = useCallback((ctx: CanvasRenderingContext2D) => {
    if (!communities.length) return;
    const positions = new Map<string, CustomNode>();
    graphData.nodes.forEach((node) => positions.set(node.uuid, node));
    communities.forEach((community) => {
      const members = (community.entity_ids ?? [])
        .map((id) => positions.get(id))
        .filter((node): node is CustomNode => Boolean(node && node.x != null && node.y != null));
      if (members.length < 2) return;
      const cx = members.reduce((sum, node) => sum + (node.x as number), 0) / members.length;
      const cy = members.reduce((sum, node) => sum + (node.y as number), 0) / members.length;
      const radius = Math.max(42, ...members.map((node) => Math.hypot((node.x as number) - cx, (node.y as number) - cy) + 24));
      const color = communityColor(community.community);
      const gradient = ctx.createRadialGradient(cx, cy, radius * 0.25, cx, cy, radius);
      gradient.addColorStop(0, `${color.replace("hsl", "hsla").replace(")", ", 0.18)")}`);
      gradient.addColorStop(1, `${color.replace("hsl", "hsla").replace(")", ", 0.03)")}`);
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fillStyle = gradient;
      ctx.fill();
      ctx.strokeStyle = `${color.replace("hsl", "hsla").replace(")", ", 0.5)")}`;
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 6]);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.font = "bold 11px Sans-Serif";
      ctx.fillStyle = color;
      ctx.textAlign = "center";
      ctx.fillText(`L${community.level} · ${community.title}`, cx, cy - radius - 8);
    });
  }, [communities, graphData.nodes]);

  const focusCommunityNode = (node: CustomNode) => {
    const community = communities.find((c) => c.id.toString() === node.id);
    if (community) applyCommunityFocus(community);
  };

  return (
    <Box
      sx={{
        height: isFullscreen ? "100vh" : "calc(100vh - 64px)",
        width: isFullscreen ? "100vw" : "100%",
        position: isFullscreen ? "fixed" : "relative",
        top: 0,
        left: 0,
        zIndex: isFullscreen ? 1300 : "auto",
        overflow: "hidden",
        margin: 0,
        padding: 0,
        backgroundColor: getBackgroundColor(),
      }}
    >
      <Box
        sx={{
          position: "absolute",
          top: 12,
          left: 16,
          zIndex: 1400,
          maxWidth: 360,
          p: 1.5,
          borderRadius: 2,
          bgcolor: theme.palette.mode === "dark" ? "rgba(20,24,34,.92)" : "rgba(255,255,255,.94)",
          boxShadow: 3,
        }}
      >
        <Typography variant="overline" color="text.secondary">GraphRAG community map</Typography>
        <Typography variant="h6" sx={{ lineHeight: 1.15 }}>AGE graph overview</Typography>
        <Box sx={{ display: "flex", gap: .75, mt: 1, flexWrap: "wrap" }}>
          <Chip size="small" label={`${communities.length} communities`} />
          <Chip size="small" label={`${nodeCount} nodes shown`} />
          <Chip size="small" label={`${linkCount} links shown`} />
        </Box>
        {focusedCommunity && (
          <Button size="small" sx={{ mt: .75, px: 0 }} onClick={clearCommunityFocus}>
            ← 전체 커뮤니티 보기
          </Button>
        )}
      </Box>
      <Box
        sx={{
          position: "absolute",
          top: 10,
          right: 10,
          zIndex: 1400,
          display: "flex",
          flexDirection: "column",
          gap: 2,
          alignItems: "flex-end",
        }}
      >
        <Box sx={{ display: "flex", gap: 2, alignItems: "center" }}>
          <Button
            variant="contained"
            onClick={toggleDrawer(true)}
            startIcon={<SearchIcon />}
          >
            Search Nodes/Links
          </Button>
          {/* <FormControlLabel
            control={
              <Switch
                checked={graphType === "3d"}
                onChange={onToggleGraphType}
              />
            }
            label="3D View"
          /> */}
          {/* <FormControlLabel
            control={
              <Switch
                checked={showLabels}
                onChange={() => setShowLabels(!showLabels)}
              />
            }
            label="Show Node Labels"
          />
          <FormControlLabel
            control={
              <Switch
                checked={showLinkLabels}
                onChange={() => setShowLinkLabels(!showLinkLabels)}
              />
            }
            label="Show Relationship Labels"
          />
          <FormControlLabel
            control={
              <Switch
                checked={showHighlight}
                onChange={() => setShowHighlight(!showHighlight)}
              />
            }
            label="Show Highlight"
          /> */}
          <Tooltip title={isFullscreen ? "Exit Full Screen" : "Full Screen"}>
            <IconButton onClick={onToggleFullscreen} color="inherit">
              {isFullscreen ? <FullscreenExitIcon /> : <FullscreenIcon />}
            </IconButton>
          </Tooltip>
        </Box>

        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            gap: 1,
            alignItems: "flex-start",
          }}
        >
          <FormControlLabel
            control={
              <Switch
                checked={graphType === "3d"}
                onChange={onToggleGraphType}
              />
            }
            label="3D View"
          />
          <FormControlLabel
            control={
              <Switch
                checked={showLabels}
                onChange={() => setShowLabels(!showLabels)}
              />
            }
            label="Show Node Labels"
          />
          <FormControlLabel
            control={
              <Switch
                checked={showLinkLabels}
                onChange={() => setShowLinkLabels(!showLinkLabels)}
              />
            }
            label="Show Link Labels"
          />
          <FormControlLabel
            control={
              <Switch
                checked={showHighlight}
                onChange={() => setShowHighlight(!showHighlight)}
              />
            }
            label="Show Highlight"
          />
          <FormControlLabel
            control={
              <Switch
                checked={colorByCommunity}
                onChange={() => setColorByCommunity(!colorByCommunity)}
                disabled={communities.length === 0}
              />
            }
            label="Color by Community"
          />
        </Box>

        <FormGroup>
          <FormControlLabel
            control={
              <Checkbox
                checked={includeDocuments}
                onChange={() => onIncludeDocumentsChange(!includeDocuments)}
                disabled={!hasDocuments || apiSearchResults !== null}
              />
            }
            label="Include Documents"
          />
          <FormControlLabel
            control={
              <Checkbox
                checked={includeTextUnits}
                // onChange={() => onIncludeTextUnitsChange(!includeTextUnits)}
                onChange={() => {
                  if (!includeTextUnits) {
                    onIncludeTextUnitsChange(true);
                  } else if (includeTextUnits && !includeCovariates) {
                    onIncludeTextUnitsChange(false);
                  } else {
                    onIncludeTextUnitsChange(false);
                    onIncludeCovariatesChange(false); // Uncheck Covariates when Text Units is unchecked
                  }
                }}
                disabled={!hasTextUnits || apiSearchResults !== null}
              />
            }
            label="Include Text Units"
          />
          <FormControlLabel
            control={
              <Checkbox
                checked={includeCommunities}
                onChange={() => onIncludeCommunitiesChange(!includeCommunities)}
                disabled={!hasCommunities || apiSearchResults !== null}
              />
            }
            label="Include Communities"
          />
          {communityLevels.length > 1 && (
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, py: 0.5 }}>
              <Typography variant="body2">Level</Typography>
              <ToggleButtonGroup
                size="small"
                exclusive
                value={communityLevel ?? "all"}
                onChange={(_, value) => {
                  if (value !== null)
                    onCommunityLevelChange(value === "all" ? null : value);
                }}
                disabled={apiSearchResults !== null}
              >
                <ToggleButton value="all">All</ToggleButton>
                {communityLevels.map((level) => (
                  <ToggleButton key={level} value={level}>
                    L{level}
                  </ToggleButton>
                ))}
              </ToggleButtonGroup>
            </Box>
          )}
          <FormControlLabel
            control={
              <Checkbox
                checked={hideUnclustered}
                onChange={() => onHideUnclusteredChange(!hideUnclustered)}
                disabled={!hasCommunities || apiSearchResults !== null}
              />
            }
            label="Hide Unclustered Entities"
          />

          <FormControlLabel
            control={
              <Checkbox
                checked={includeCovariates}
                onChange={() => {
                  if (!includeCovariates) {
                    if (!includeTextUnits) {
                      onIncludeTextUnitsChange(true);
                    }
                    onIncludeCovariatesChange(true);
                  } else {
                    onIncludeCovariatesChange(false);
                  }
                }}
                disabled={!hasCovariates || apiSearchResults !== null}
              />
            }
            label="Include Covariates"
          />
        </FormGroup>

        {totalEntities > 0 && (
          <Box sx={{ width: 200, mt: 2 }}>
            <Typography variant="body2" gutterBottom>
              Max Entities: {maxEntities === 0 ? "All" : maxEntities}
              {totalEntities > 0 && ` / ${totalEntities}`}
            </Typography>
            <Slider
              value={maxEntities}
              onChange={(_, value) => onMaxEntitiesChange(value as number)}
              min={0}
              max={Math.max(totalEntities, 1000)}
              step={50}
              marks={[
                { value: 0, label: "All" },
                { value: 500, label: "500" },
              ]}
              valueLabelDisplay="auto"
              valueLabelFormat={(value) => (value === 0 ? "All" : value)}
              disabled={apiSearchResults !== null}
            />
          </Box>
        )}
        {communityMode && (
          <CommunityLegend
            communities={communities}
            focusedId={focusedCommunity ? focusedCommunity.id.toString() : null}
            disabled={apiSearchResults !== null}
            onSelect={applyCommunityFocus}
          />
        )}
      </Box>

      <APISearchDrawer
        apiDrawerOpen={apiDrawerOpen}
        toggleDrawer={toggleApiDrawer}
        handleApiSearch={handleApiSearch}
        apiSearchResults={apiSearchResults}
        localSearchEnabled={localSearchEnabled}
        globalSearchEnabled={includeCommunities}
        hasCovariates={hasCovariates}
        serverUp={serverUp}
      />

      <SearchDrawer
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
        handleSearch={handleSearch}
        searchResults={searchResults}
        rightDrawerOpen={rightDrawerOpen}
        toggleDrawer={toggleDrawer}
        handleFocusButtonClick={handleFocusButtonClick}
        handleNodeClick={handleNodeClick}
        handleFocusLinkClick={handleFocusLinkClick}
        handleLinkClick={handleLinkClick}
      />

      <DetailDrawer
        bottomDrawerOpen={bottomDrawerOpen}
        setBottomDrawerOpen={setBottomDrawerOpen}
        selectedNode={selectedNode}
        selectedRelationship={selectedRelationship}
        linkedNodes={linkedNodes}
        linkedRelationships={linkedRelationships}
        onFocusCommunity={focusCommunityNode}
      />

        {graphType === "2d" ? (
          <ForceGraph2D
          ref={graphRef}
            graphData={graphData}
            onRenderFramePre={(ctx) => paintCommunityClouds(ctx)}
            onNodeDrag={moveCommunity}
            onNodeDragEnd={finishCommunityDrag}
          nodeRelSize={NODE_R}
          nodeColor={(node) => getNodeColor(node as CustomNode)}
          nodeVal={(node) => communityNodeVal(node as CustomNode)}
          autoPauseRedraw={false}
          linkWidth={(link) =>
            showHighlight && highlightLinks.has(link) ? 5 : 1
          }
          linkDirectionalParticles={showHighlight ? 4 : 0}
          linkDirectionalParticleWidth={(link) =>
            showHighlight && highlightLinks.has(link) ? 4 : 0
          }
          linkDirectionalParticleColor={
            showHighlight ? getlinkDirectionalParticleColor : undefined
          }
          nodeCanvasObjectMode={(node) =>
            showHighlight && highlightNodes.has(node)
              ? "before"
              : showLabels
              ? "after"
              : undefined
          }
          nodeCanvasObject={(node, ctx) => {
            if (showHighlight && highlightNodes.has(node)) {
              paintRing(node as CustomNode, ctx);
            }
            if (showLabels) {
              renderNodeLabel(node as CustomNode, ctx);
            }
          }}
          linkCanvasObjectMode={() => (showLinkLabels ? "after" : undefined)}
          linkCanvasObject={(link, ctx) => {
            if (showLinkLabels) {
              const label = link.type || "";
              const fontSize = 4;
              ctx.font = `${fontSize}px Sans-Serif`;
              ctx.fillStyle =
                theme.palette.mode === "dark" ? "lightgray" : "darkgray";
              const source =
                typeof link.source !== "string"
                  ? (link.source as CustomNode)
                  : null;
              const target =
                typeof link.target !== "string"
                  ? (link.target as CustomNode)
                  : null;

              if (
                source &&
                target &&
                source.x !== undefined &&
                target.x !== undefined &&
                source.y !== undefined &&
                target.y !== undefined
              ) {
                const textWidth = ctx.measureText(label).width;
                const posX = (source.x + target.x) / 2 - textWidth / 2;
                const posY = (source.y + target.y) / 2;
                ctx.fillText(label, posX, posY);
              }
            }
          }}
          onNodeHover={showHighlight ? handleNodeHover : undefined}
          onLinkHover={showHighlight ? handleLinkHover : undefined}
          onNodeClick={handleNodeClick}
          onLinkClick={handleLinkClick}
          backgroundColor={getBackgroundColor()}
          linkColor={getLinkColor}
        />
      ) : (
          <ForceGraph3D
          ref={graphRef}
          extraRenderers={extraRenderers}
            graphData={graphData}
            onNodeDrag={moveCommunity}
            onNodeDragEnd={finishCommunityDrag}
          nodeRelSize={NODE_R}
          nodeColor={(node) => getNodeColor(node as CustomNode)}
          nodeVal={(node) => communityNodeVal(node as CustomNode)}
          linkWidth={(link) =>
            showHighlight && highlightLinks.has(link) ? 5 : 1
          }
          linkDirectionalParticles={showHighlight ? 4 : 0}
          linkDirectionalParticleWidth={(link) =>
            showHighlight && highlightLinks.has(link) ? 4 : 0
          }
          nodeThreeObject={nodeThreeObject}
          nodeThreeObjectExtend={true}
          onNodeHover={showHighlight ? handleNodeHover : undefined}
          onLinkHover={showHighlight ? handleLinkHover : undefined}
          onNodeClick={handleNodeClick}
          onLinkClick={handleLinkClick}
          backgroundColor={getBackgroundColor()}
          linkColor={get3DLinkColor}
          linkThreeObjectExtend={true}
          linkThreeObject={(link) => {
            if (!showLinkLabels) new THREE.Object3D();
            const sprite = new SpriteText(`${link.type}`);
            sprite.color = "lightgrey";
            sprite.textHeight = 1.5;
            return sprite;
          }}
          linkPositionUpdate={(sprite, { start, end }) => {
            if (!showLinkLabels) return;

            const middlePos = ["x", "y", "z"].reduce((acc, c) => {
              acc[c as keyof Coords] =
                start[c as keyof Coords] +
                (end[c as keyof Coords] - start[c as keyof Coords]) / 2;
              return acc;
            }, {} as Coords);

            // Position sprite
            Object.assign(sprite.position, middlePos);
          }}
        />
      )}
      <Box
        sx={{
          position: "absolute",
          top: 10,
          left: 10,
          zIndex: 1400,
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          gap: 1,
        }}
      >
        <Typography variant="body2">Nodes: {nodeCount}</Typography>
        <Typography variant="body2">Relationships: {linkCount}</Typography>
        {focusedCommunity && (
          <Chip
            color="primary"
            label={`Focus: ${focusedCommunity.title} (${focusedCommunity.size})`}
            onDelete={clearCommunityFocus}
          />
        )}
        <Button
          variant="contained"
          onClick={toggleApiDrawer(true)}
          startIcon={<SearchIcon />}
        >
          Ask Query (Local/Global Search)
        </Button>
        <Button
          variant="contained"
          onClick={clearSearchResults}
          startIcon={<DeleteIcon />}
          color="warning"
          disabled={apiSearchResults === null}
        >
          Clear Query Results
        </Button>
      </Box>
    </Box>
  );
};

export default GraphViewer;
