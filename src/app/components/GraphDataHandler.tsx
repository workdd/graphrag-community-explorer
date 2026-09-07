import React, { useState, useEffect, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import GraphViewer from "./GraphViewer";
import { Box, Button, Container, Tab, Tabs } from "@mui/material";
import { useDropzone } from "react-dropzone";
import DropZone from "./DropZone";
import Introduction from "./Introduction";
import useFileHandler from "../hooks/useFileHandler";
import useGraphData from "../hooks/useGraphData";
import DataTableContainer from "./DataTableContainer";
import ReactGA from "react-ga4";
import CommunityOverview from "./CommunityOverview";
import { Community } from "../models/community";

const GraphDataHandler: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();

  const [tabIndex, setTabIndex] = useState(0);
  const [graphType, setGraphType] = useState<"2d" | "3d">("2d");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [selectedTable, setSelectedTable] = useState<
    | "entities"
    | "relationships"
    | "documents"
    | "textunits"
    | "communities"
    | "communityReports"
    | "covariates"
  >("entities");
  const [includeDocuments, setIncludeDocuments] = useState(false);
  const [includeTextUnits, setIncludeTextUnits] = useState(false);
  // Community grouping is rendered as clouds/colors by default; center Community
  // nodes are opt-in so the resource graph remains readable.
  const [includeCommunities, setIncludeCommunities] = useState(false);
  const [communityLevel, setCommunityLevel] = useState<number | null>(null);
  const [communityMode, setCommunityMode] = useState<"operational" | "leiden">("operational");
  const [hideUnclustered, setHideUnclustered] = useState(false);
  const [includeCovariates, setIncludeCovariates] = useState(false);
  const [maxEntities, setMaxEntities] = useState(150);
  const [showCommunityOverview, setShowCommunityOverview] = useState(true);
  const [requestedCommunity, setRequestedCommunity] = useState<Community | null>(null);

  const {
    entities,
    relationships,
    documents,
    textunits,
    communities,
    covariates,
    communityReports,
    leidenCommunities,
    handleFilesRead,
    loadDefaultFiles,
  } = useFileHandler();

  const activeCommunities = communityMode === "leiden" && leidenCommunities.length ? leidenCommunities : communities;
  const communityLevels = useMemo(
    () => [...new Set(activeCommunities.map((c) => c.level))].sort((a, b) => a - b),
    [activeCommunities]
  );
  // The level filter narrows communities for hubs, colouring, legend and focus alike.
  const visibleCommunities = useMemo(
    () =>
      communityLevel === null
        ? communities
        : activeCommunities.filter((c) => c.level === communityLevel),
    [activeCommunities, communityLevel]
  );

  const graphData = useGraphData(
    entities,
    relationships,
    documents,
    textunits,
    visibleCommunities,
    communityReports,
    covariates,
    includeDocuments,
    includeTextUnits,
    includeCommunities,
    includeCovariates,
    maxEntities,
    hideUnclustered
  );

  const hasDocuments = documents.length > 0;
  const hasTextUnits = textunits.length > 0;
  const hasCommunities = communities.length > 0;
  const hasCovariates = covariates.length > 0;

  useEffect(() => {
    if (process.env.NODE_ENV === "development") {
      loadDefaultFiles();
    }
    // eslint-disable-next-line
  }, []);

  useEffect(() => {
    const measurementId = process.env.REACT_APP_GA_MEASUREMENT_ID;
    if (measurementId) {
      ReactGA.initialize(measurementId);
    } else {
      console.error("Google Analytics measurement ID not found");
    }
  }, []);

  useEffect(() => {
    // **Set tab index based on the current path**
    switch (location.pathname) {
      case "/upload":
        setTabIndex(0);
        break;
      case "/graph":
        setTabIndex(1);
        break;
      case "/data":
        setTabIndex(2);
        break;
      default:
        setTabIndex(0);
    }
  }, [location.pathname]);

  const onDrop = (acceptedFiles: File[]) => {
    handleFilesRead(acceptedFiles);
    navigate("/graph", { replace: true });
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    noClick: false,
    noKeyboard: true,
    accept: {
      "application/x-parquet": [".parquet"],
    },
  });

  const handleChange = (event: React.ChangeEvent<{}>, newValue: number) => {
    setTabIndex(newValue);
    let path = "/upload";
    if (newValue === 1) path = "/graph";
    if (newValue === 2) path = "/data";
    navigate(path);
    ReactGA.send({
      hitType: "event",
      eventCategory: "Tabs",
      eventAction: "click",
      eventLabel: `Tab ${newValue}`,
    });
  };

  const toggleGraphType = () => {
    setGraphType((prevType) => (prevType === "2d" ? "3d" : "2d"));
  };

  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
  };

  return (
    <>
      <Tabs value={tabIndex} onChange={handleChange} centered>
        <Tab label="Upload Artifacts" />
        <Tab label="Graph Visualization" />
        <Tab label="Data Tables" />
      </Tabs>
      {tabIndex === 0 && (
        <Container
          maxWidth="md"
          sx={{
            mt: 3,
            display: "flex",
            flexDirection: "column",
          }}
        >
          <DropZone {...{ getRootProps, getInputProps, isDragActive }} />
          <Introduction />
        </Container>
      )}
      {tabIndex === 1 && (
        showCommunityOverview ? <Box><Box sx={{p:2,display:'flex',gap:1,justifyContent:'center',flexWrap:'wrap'}}><Button variant={communityMode==='operational'?'contained':'outlined'} onClick={()=>setCommunityMode('operational')}>운영 커뮤니티</Button><Button variant={communityMode==='leiden'?'contained':'outlined'} disabled={!leidenCommunities.length} onClick={()=>setCommunityMode('leiden')}>Leiden 구조 커뮤니티</Button></Box><CommunityOverview communities={activeCommunities} entities={entities} onOpenGraph={(community) => { setRequestedCommunity(community ?? null); setShowCommunityOverview(false); }} /></Box> :
        <Box
          p={3}
          sx={{
            height: isFullscreen ? "100vh" : "calc(100vh - 64px)",
            width: isFullscreen ? "100vw" : "100%",
            position: isFullscreen ? "fixed" : "relative",
            top: 0,
            left: 0,
            zIndex: isFullscreen ? 1300 : "auto",
            overflow: "hidden",
          }}
        >
          <GraphViewer
            data={graphData}
            graphType={graphType}
            isFullscreen={isFullscreen}
            onToggleFullscreen={toggleFullscreen}
            onToggleGraphType={toggleGraphType}
            includeDocuments={includeDocuments}
            includeTextUnits={includeTextUnits}
            onIncludeDocumentsChange={() =>
              setIncludeDocuments(!includeDocuments)
            }
            onIncludeTextUnitsChange={() =>
              setIncludeTextUnits(!includeTextUnits)
            }
            includeCommunities={includeCommunities}
            onIncludeCommunitiesChange={() =>
              setIncludeCommunities(!includeCommunities)
            }
            includeCovariates={includeCovariates}
            onIncludeCovariatesChange={() =>
              setIncludeCovariates(!includeCovariates)
            }
            hasDocuments={hasDocuments}
            hasTextUnits={hasTextUnits}
            hasCommunities={hasCommunities}
            hasCovariates={hasCovariates}
            maxEntities={maxEntities}
            onMaxEntitiesChange={setMaxEntities}
            totalEntities={entities.length}
            communities={visibleCommunities}
            communityLevels={communityLevels}
            communityLevel={communityLevel}
            onCommunityLevelChange={setCommunityLevel}
            hideUnclustered={hideUnclustered}
            onHideUnclusteredChange={setHideUnclustered}
            initialCommunity={requestedCommunity}
          />
        </Box>
      )}

      {tabIndex === 2 && (
        <Box sx={{ display: "flex", height: "calc(100vh - 64px)" }}>
          <DataTableContainer
            selectedTable={selectedTable}
            setSelectedTable={setSelectedTable}
            entities={entities}
            relationships={relationships}
            documents={documents}
            textunits={textunits}
            communities={communities}
            communityReports={communityReports}
            covariates={covariates}
          />
        </Box>
      )}
    </>
  );
};

export default GraphDataHandler;
