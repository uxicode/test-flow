export interface FigmaReactionAction {
  type?: string;
  destinationId?: string | null;
}

export interface FigmaReaction {
  action?: FigmaReactionAction;
  actions?: FigmaReactionAction[];
}

export interface FigmaConnectorEnd {
  endpointNodeId?: string;
}

export interface FigmaApiNode {
  id: string;
  name: string;
  type: string;
  characters?: string;
  transitionNodeID?: string | null;
  reactions?: FigmaReaction[];
  connectorStart?: FigmaConnectorEnd;
  connectorEnd?: FigmaConnectorEnd;
  children?: FigmaApiNode[];
}
