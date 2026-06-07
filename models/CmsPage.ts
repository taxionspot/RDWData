import { model, models, Schema, type Model } from "mongoose";

export type CmsPageDoc = {
  title: string;
  slug: string;
  content: string;
  published: boolean;
  showInHeader: boolean;
  showInFooter: boolean;
  // Version of the code-managed legal copy this page was last seeded from. Lets
  // ensureLegalPages refresh outdated legal text without clobbering admin edits
  // made at the current version. Absent on non-legal pages.
  legalVersion?: number;
  createdAt: Date;
  updatedAt: Date;
};

const cmsPageSchema = new Schema<CmsPageDoc>(
  {
    title: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, index: true, trim: true, lowercase: true },
    content: { type: String, required: true, default: "" },
    published: { type: Boolean, required: true, default: false },
    showInHeader: { type: Boolean, required: true, default: false },
    showInFooter: { type: Boolean, required: true, default: false },
    legalVersion: { type: Number, required: false }
  },
  { timestamps: true, versionKey: false }
);

export const CmsPageModel: Model<CmsPageDoc> =
  (models.CmsPage as Model<CmsPageDoc> | undefined) ||
  model<CmsPageDoc>("CmsPage", cmsPageSchema);

