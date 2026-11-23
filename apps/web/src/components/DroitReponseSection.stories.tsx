import type { Meta, StoryObj } from "@storybook/react";
import { DroitReponseBloc, DroitReponseSection } from "./DroitReponseSection";
import { orgDetail, rectifications } from "../storybook/fixtures";

const meta = {
  title: "Design System/DroitReponseSection",
  component: DroitReponseSection,
  parameters: { docs: { description: { component: "Published rectifications and the right-of-reply request form." } } },
  args: {
    organisation: orgDetail.org.name,
    domain: orgDetail.org.domain,
    publiees: rectifications.items,
    etat: "ferme" as const,
    valeurs: {
      organisation: orgDetail.org.name,
      contactNom: "",
      email: "",
      domaine: orgDetail.org.domain ?? "",
      motif: "inexactitude" as const,
      message: "",
      pieceJointeRef: "",
    },
    erreurs: {},
    messageErreur: null,
    reference: null,
    onOuvrir: () => {},
    onFermer: () => {},
    onChanger: () => {},
    onEnvoyer: () => {},
  },
} satisfies Meta<typeof DroitReponseSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithPublishedReply: Story = {};
export const Empty: Story = { args: { publiees: [] } };

/** Container variant: stateful form wired to the existing API path. */
export const InteractiveBloc: Story = {
  render: () => (
    <DroitReponseBloc
      orgId={orgDetail.org.id}
      organisation={orgDetail.org.name}
      domain={orgDetail.org.domain}
      initial={rectifications}
    />
  ),
};
