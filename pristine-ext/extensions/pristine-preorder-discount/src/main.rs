#![no_main]

use shopify_function::prelude::*;
use shopify_function::Result;

#[derive(Clone, Debug, Default, Deserialize, PartialEq)]
#[shopify_function(rename_all = "camelCase")]
struct Configuration {
    #[shopify_function(default)]
    tiers: Vec<Tier>,
    #[shopify_function(default)]
    manual_override_benefits: ManualOverrideBenefits,
    #[shopify_function(default)]
    travel_size_mappings: Vec<TravelSizeMapping>,
    #[shopify_function(default)]
    sample_entitlements: Vec<SampleEntitlement>,
    #[shopify_function(default)]
    sample_variant_ids: Vec<String>,
    #[shopify_function(default)]
    auto_benefits: Vec<Benefit>,
    #[shopify_function(default)]
    mode: Option<String>,
    #[shopify_function(default)]
    forced_code: Option<String>,
}

#[derive(Clone, Debug, Default, Deserialize, PartialEq)]
#[shopify_function(rename_all = "camelCase")]
struct ManualOverrideBenefits {
    #[shopify_function(default)]
    free_travel: Option<Benefit>,
    #[shopify_function(rename = "FREETRAVEL")]
    #[shopify_function(default)]
    free_travel_code: Option<Benefit>,
}

#[derive(Clone, Debug, Default, Deserialize, PartialEq)]
#[shopify_function(rename_all = "camelCase")]
struct Tier {
    #[shopify_function(default)]
    code: Option<String>,
    #[shopify_function(default)]
    minimum_subtotal: f64,
    #[shopify_function(default)]
    maximum_subtotal: Option<f64>,
    #[shopify_function(default)]
    percentage: Option<f64>,
    #[shopify_function(default)]
    free_travel_size_quantity: Option<f64>,
    #[shopify_function(default)]
    free_fixed_items: Vec<FreeFixedItem>,
}

#[derive(Clone, Debug, Default, Deserialize, PartialEq)]
#[shopify_function(rename_all = "camelCase")]
struct Benefit {
    #[shopify_function(default)]
    code: Option<String>,
    #[shopify_function(default)]
    free_travel_size_quantity: Option<f64>,
    #[shopify_function(default)]
    free_travel_size_per_full_size: Option<f64>,
    #[shopify_function(default)]
    free_fixed_items: Vec<FreeFixedItem>,
}

#[derive(Clone, Debug, Default, Deserialize, PartialEq)]
#[shopify_function(rename_all = "camelCase")]
struct FreeFixedItem {
    variant_id: String,
    quantity: f64,
}

#[derive(Clone, Debug, Default, Deserialize, PartialEq)]
#[shopify_function(rename_all = "camelCase")]
struct TravelSizeMapping {
    #[shopify_function(default)]
    category: Option<String>,
    #[shopify_function(default)]
    full_size_product_types: Vec<String>,
    #[shopify_function(default)]
    travel_size_variant_ids: Vec<String>,
}

#[derive(Clone, Debug, Default, Deserialize, PartialEq)]
#[shopify_function(rename_all = "camelCase")]
struct SampleEntitlement {
    #[shopify_function(default)]
    minimum_subtotal: f64,
    #[shopify_function(default)]
    maximum_subtotal: Option<f64>,
    #[shopify_function(default)]
    quantity: f64,
    #[shopify_function(default)]
    additional_quantity_per_subtotal: Option<f64>,
}

#[derive(Clone)]
struct Line {
    id: String,
    quantity: i32,
    unit_amount: f64,
    variant_id: String,
    product_type: Option<String>,
}

struct BenefitResult {
    savings: f64,
    order_candidates: Vec<schema::OrderDiscountCandidate>,
    product_candidates: Vec<ProductCandidate>,
}

struct ProductCandidate {
    estimated_savings: f64,
    candidate: schema::ProductDiscountCandidate,
}

#[typegen("./schema.graphql")]
pub mod schema {
    #[query("src/run.graphql", custom_scalar_overrides = {"RunInput.discount.metafield.jsonValue" => super::Configuration})]
    pub mod run {}
}

#[export_name = "_start"]
pub extern "C" fn start() {
    std::process::abort();
}

#[shopify_function]
fn run(input: schema::run::RunInput) -> Result<schema::CartLinesDiscountsGenerateRunResult> {
    let config = input
        .discount()
        .metafield()
        .map(|metafield| metafield.json_value())
        .unwrap_or(&Configuration::default())
        .clone();
    let subtotal = input.cart().cost().subtotal_amount().amount().as_f64();
    let lines = get_product_variant_lines(input.cart().lines());

    let best_benefit = if config.mode.as_deref() == Some("manual_override") {
        build_manual_override_benefit(&input, &config, subtotal, &lines)
    } else {
        let tier_benefit = get_tier_for_subtotal(subtotal, &config.tiers)
            .map(|tier| build_tier_benefit(&input, &config, tier, subtotal, &lines));
        let sample_benefit = Some(build_sample_benefit(&input, &config, subtotal, &lines));
        let auto_benefits = config.auto_benefits.iter()
            .map(|benefit| build_product_benefit(&input, &config, benefit, subtotal, &lines));

        tier_benefit.into_iter()
            .chain(auto_benefits)
            .chain(sample_benefit)
            .filter(|benefit| !benefit.order_candidates.is_empty() || !benefit.product_candidates.is_empty())
            .max_by(|left, right| left.savings.partial_cmp(&right.savings).unwrap_or(std::cmp::Ordering::Equal))
    };

    Ok(build_result_for_benefit(&input, best_benefit))
}

fn build_manual_override_benefit(
    input: &schema::run::RunInput,
    config: &Configuration,
    subtotal: f64,
    lines: &[Line],
) -> Option<BenefitResult> {
    let forced_benefit = match config.forced_code.as_deref() {
        Some("FREETRAVEL") => config.manual_override_benefits.free_travel_code.as_ref()
            .or(config.manual_override_benefits.free_travel.as_ref()),
        _ => None,
    };

    forced_benefit.map(|benefit| build_product_benefit(input, config, benefit, subtotal, lines))
}

fn build_tier_benefit(
    input: &schema::run::RunInput,
    config: &Configuration,
    tier: &Tier,
    subtotal: f64,
    lines: &[Line],
) -> BenefitResult {
    let mut order_candidates = Vec::new();
    let mut product_candidates = Vec::new();
    let mut savings = 0.0;

    if has_discount_class(input, schema::DiscountClass::Order) {
        let percentage = tier.percentage.unwrap_or(0.0);
        savings += subtotal * (percentage / 100.0);
        order_candidates.push(schema::OrderDiscountCandidate {
            associated_discount_code: None,
            conditions: None,
            message: tier.code.clone(),
            targets: vec![schema::OrderDiscountCandidateTarget::OrderSubtotal(
                schema::OrderSubtotalTarget {
                    excluded_cart_line_ids: vec![],
                },
            )],
            value: schema::OrderDiscountCandidateValue::Percentage(
                schema::Percentage {
                    value: shopify_function::scalars::Decimal(percentage),
                },
            ),
        });
    }

    if has_discount_class(input, schema::DiscountClass::Product) {
        let product_benefit = build_product_benefit(input, config, &tier_to_benefit(tier), subtotal, lines);
        savings += product_benefit.savings;
        product_candidates.extend(product_benefit.product_candidates);
    }

    BenefitResult {
        savings,
        order_candidates,
        product_candidates,
    }
}

fn build_product_benefit(
    input: &schema::run::RunInput,
    config: &Configuration,
    benefit: &Benefit,
    subtotal: f64,
    lines: &[Line],
) -> BenefitResult {
    if !has_discount_class(input, schema::DiscountClass::Product) {
        return empty_benefit();
    }

    let mut product_candidates = Vec::new();
    product_candidates.extend(build_free_fixed_item_candidates(lines, &benefit.free_fixed_items, "Free item"));
    product_candidates.extend(build_free_travel_size_candidates(lines, &config.travel_size_mappings, benefit, subtotal));
    let savings = estimate_product_savings(&product_candidates);

    BenefitResult {
        savings,
        order_candidates: vec![],
        product_candidates,
    }
}

fn build_sample_benefit(
    input: &schema::run::RunInput,
    config: &Configuration,
    subtotal: f64,
    lines: &[Line],
) -> BenefitResult {
    if !has_discount_class(input, schema::DiscountClass::Product) {
        return empty_benefit();
    }

    let entitlement = get_sample_entitlement(subtotal, &config.sample_entitlements);
    let product_candidates = build_free_variant_candidates(
        lines,
        &config.sample_variant_ids,
        entitlement,
        "Free sample",
        None,
    );
    let savings = estimate_product_savings(&product_candidates);

    BenefitResult {
        savings,
        order_candidates: vec![],
        product_candidates,
    }
}

fn build_free_fixed_item_candidates(
    lines: &[Line],
    free_fixed_items: &[FreeFixedItem],
    message: &str,
) -> Vec<ProductCandidate> {
    free_fixed_items.iter().flat_map(|item| {
        build_free_variant_candidates(
            lines,
            &[item.variant_id.clone()],
            item.quantity,
            message,
            None,
        )
    }).collect()
}

fn build_free_travel_size_candidates(
    lines: &[Line],
    mappings: &[TravelSizeMapping],
    benefit: &Benefit,
    subtotal: f64,
) -> Vec<ProductCandidate> {
    let quantity_limit = benefit.free_travel_size_quantity
        .or(benefit.free_travel_size_per_full_size)
        .unwrap_or(0.0);

    if quantity_limit <= 0.0 {
        return vec![];
    }

    mappings.iter().flat_map(|mapping| {
        let full_size_quantity = count_matching_full_size_quantity(lines, mapping);
        let eligible_quantity = if benefit.free_travel_size_per_full_size.is_some() {
            full_size_quantity * quantity_limit
        } else {
            quantity_limit
        };
        let product_types = if subtotal >= 3000.0 {
            None
        } else {
            Some(mapping.full_size_product_types.clone())
        };

        build_free_variant_candidates(
            lines,
            &mapping.travel_size_variant_ids,
            eligible_quantity.min(count_matching_travel_quantity(lines, &mapping.travel_size_variant_ids, product_types.as_ref())),
            "Free travel-size item",
            product_types.as_ref(),
        )
    }).collect()
}

fn build_free_variant_candidates(
    lines: &[Line],
    variant_ids: &[String],
    max_quantity: f64,
    message: &str,
    product_types: Option<&Vec<String>>,
) -> Vec<ProductCandidate> {
    if max_quantity <= 0.0 {
        return vec![];
    }

    let mut remaining_quantity = max_quantity.floor() as i32;
    let mut candidates = Vec::new();

    for line in lines {
        if remaining_quantity <= 0 {
            break;
        }

        let matches_variant = variant_ids.iter().any(|variant_id| variant_id == &line.variant_id);
        let matches_type = product_types.map_or(true, |types| {
            line.product_type.as_ref().map_or(false, |line_type| types.iter().any(|item| item == line_type))
        });

        if !matches_variant || !matches_type {
            continue;
        }

        let quantity = remaining_quantity.min(line.quantity);
        if quantity <= 0 {
            continue;
        }

        candidates.push(ProductCandidate {
            estimated_savings: line.unit_amount * f64::from(quantity),
            candidate: schema::ProductDiscountCandidate {
                associated_discount_code: None,
                prerequisites: None,
                message: Some(message.to_string()),
                targets: vec![schema::ProductDiscountCandidateTarget::CartLine(
                    schema::CartLineTarget {
                        id: line.id.clone(),
                        quantity: Some(quantity),
                    },
                )],
                value: schema::ProductDiscountCandidateValue::Percentage(
                    schema::Percentage {
                        value: shopify_function::scalars::Decimal(100.0),
                    },
                ),
            },
        });

        remaining_quantity -= quantity;
    }

    candidates
}

fn get_product_variant_lines(lines: &[schema::run::run_input::cart::Lines]) -> Vec<Line> {
    lines.iter().filter_map(|line| {
        let variant = match line.merchandise() {
            schema::run::run_input::cart::lines::Merchandise::ProductVariant(variant) => variant,
            _ => return None,
        };
        let subtotal = line.cost().subtotal_amount().amount().as_f64();
        let quantity = *line.quantity();
        let unit_amount = if quantity > 0 {
            subtotal / f64::from(quantity)
        } else {
            0.0
        };

        Some(Line {
            id: line.id().to_string(),
            quantity,
            unit_amount,
            variant_id: variant.id().to_string(),
            product_type: variant.product().product_type().cloned(),
        })
    }).collect()
}

fn get_tier_for_subtotal<'a>(subtotal: f64, tiers: &'a [Tier]) -> Option<&'a Tier> {
    tiers.iter().find(|tier| {
        subtotal >= tier.minimum_subtotal
            && tier.maximum_subtotal.map_or(true, |maximum| subtotal <= maximum)
    })
}

fn get_sample_entitlement(subtotal: f64, entitlements: &[SampleEntitlement]) -> f64 {
    let entitlement = entitlements.iter().find(|entry| {
        subtotal >= entry.minimum_subtotal
            && entry.maximum_subtotal.map_or(true, |maximum| subtotal <= maximum)
    });

    match entitlement {
        Some(entry) if entry.maximum_subtotal.is_none() => {
            let extra = entry.additional_quantity_per_subtotal.map_or(0.0, |step| {
                ((subtotal - entry.minimum_subtotal).max(0.0) / step).floor()
            });
            entry.quantity + extra
        }
        Some(entry) => entry.quantity,
        None => 0.0,
    }
}

fn count_matching_full_size_quantity(lines: &[Line], mapping: &TravelSizeMapping) -> f64 {
    lines.iter().fold(0.0, |sum, line| {
        let is_travel_size = mapping.travel_size_variant_ids.iter().any(|id| id == &line.variant_id);
        let product_type_matches = line.product_type.as_ref().map_or(false, |product_type| {
            mapping.full_size_product_types.iter().any(|item| item == product_type)
        });

        if !is_travel_size && product_type_matches {
            sum + f64::from(line.quantity)
        } else {
            sum
        }
    })
}

fn count_matching_travel_quantity(
    lines: &[Line],
    variant_ids: &[String],
    product_types: Option<&Vec<String>>,
) -> f64 {
    lines.iter().fold(0.0, |sum, line| {
        let matches_variant = variant_ids.iter().any(|id| id == &line.variant_id);
        let matches_type = product_types.map_or(true, |types| {
            line.product_type.as_ref().map_or(false, |product_type| types.iter().any(|item| item == product_type))
        });

        if matches_variant && matches_type {
            sum + f64::from(line.quantity)
        } else {
            sum
        }
    })
}

fn estimate_product_savings(candidates: &[ProductCandidate]) -> f64 {
    candidates.iter().map(|candidate| candidate.estimated_savings).sum()
}

fn build_result_for_benefit(
    input: &schema::run::RunInput,
    benefit: Option<BenefitResult>,
) -> schema::CartLinesDiscountsGenerateRunResult {
    let Some(benefit) = benefit else {
        return schema::CartLinesDiscountsGenerateRunResult { operations: vec![] };
    };
    let mut operations = Vec::new();

    if !benefit.order_candidates.is_empty() && has_discount_class(input, schema::DiscountClass::Order) {
        operations.push(schema::CartOperation::OrderDiscountsAdd(
            schema::OrderDiscountsAddOperation {
                candidates: benefit.order_candidates,
                selection_strategy: schema::OrderDiscountSelectionStrategy::First,
            },
        ));
    }

    if !benefit.product_candidates.is_empty() && has_discount_class(input, schema::DiscountClass::Product) {
        operations.push(schema::CartOperation::ProductDiscountsAdd(
            schema::ProductDiscountsAddOperation {
                candidates: benefit.product_candidates.into_iter().map(|item| item.candidate).collect(),
                selection_strategy: schema::ProductDiscountSelectionStrategy::All,
            },
        ));
    }

    schema::CartLinesDiscountsGenerateRunResult { operations }
}

fn has_discount_class(input: &schema::run::RunInput, discount_class: schema::DiscountClass) -> bool {
    input.discount().discount_classes().iter().any(|item| item == &discount_class)
}

fn tier_to_benefit(tier: &Tier) -> Benefit {
    Benefit {
        code: tier.code.clone(),
        free_travel_size_quantity: tier.free_travel_size_quantity,
        free_travel_size_per_full_size: None,
        free_fixed_items: tier.free_fixed_items.clone(),
    }
}

fn empty_benefit() -> BenefitResult {
    BenefitResult {
        savings: 0.0,
        order_candidates: vec![],
        product_candidates: vec![],
    }
}
