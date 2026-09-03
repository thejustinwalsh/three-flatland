// Three.js r185 - Node System

// directives


// system
var<private> instanceIndex : u32;

// locals


// structs


// uniforms
@binding( 2 ) @group( 0 ) var nodeUniform7 : texture_2d<f32>;
@binding( 3 ) @group( 0 ) var nodeUniform8 : texture_2d<f32>;
@binding( 4 ) @group( 0 ) var nodeUniform9_sampler : sampler;
@binding( 5 ) @group( 0 ) var nodeUniform9 : texture_2d<f32>;
@binding( 6 ) @group( 0 ) var nodeUniform11 : texture_storage_2d<rgba8unorm, write>;

struct NodeBuffer_10390Struct {
	value : array< atomic<u32> >
};
@binding( 0 ) @group( 0 )
var<storage, read_write> NodeBuffer_10390 : NodeBuffer_10390Struct;

struct objectStruct {
	nodeUniform1 : vec2<f32>,
	nodeUniform2 : f32,
	nodeUniform3 : vec2<f32>,
	nodeUniform4 : f32,
	nodeUniform5 : vec2<f32>,
	nodeUniform6 : vec2<f32>,
	nodeUniform10 : f32,
	nodeUniform12 : f32
};
@binding( 1 ) @group( 0 )
var<uniform> object : objectStruct;

// vars
var<private> rcAtomicJobIndex : u32;
var<private> nodeVar0 : f32;
var<private> nodeVar1 : vec3<f32>;
var<private> nodeVar2 : f32;
var<private> nodeVar3 : f32;
var<private> nodeVar4 : f32;
var<private> nodeVar5 : vec2<f32>;
var<private> nodeVar6 : bool;
var<private> nodeVar7 : vec2<f32>;
var<private> nodeVar8 : bool;
var<private> nodeVar9 : f32;
var<private> nodeVar10 : f32;
var<private> nodeVar11 : vec2<f32>;
var<private> nodeVar12 : vec2<f32>;
var<private> nodeVar13 : vec2<f32>;
var<private> nodeVar14 : i32;
var<private> nodeVar15 : i32;
var<private> nodeVar16 : i32;
var<private> nodeVar17 : i32;
var<private> nodeVar18 : vec2<i32>;
var<private> nodeVar19 : f32;
var<private> nodeVar20 : f32;
var<private> nodeVar21 : i32;
var<private> nodeVar22 : i32;
var<private> nodeVar23 : i32;
var<private> nodeVar24 : i32;
var<private> nodeVar25 : i32;
var<private> nodeVar26 : i32;
var<private> nodeVar27 : vec2<i32>;
var<private> nodeVar28 : vec3<f32>;
var<private> nodeVar29 : f32;
var<private> nodeVar30 : f32;
var<private> nodeVar31 : f32;
var<private> nodeVar32 : f32;
var<private> nodeVar33 : f32;
var<private> nodeVar34 : i32;
var<private> nodeVar35 : i32;
var<private> nodeVar36 : i32;
var<private> nodeVar37 : i32;
var<private> nodeVar38 : i32;
var<private> nodeVar39 : i32;
var<private> nodeVar40 : vec4<f32>;
var<private> nodeVar41 : f32;
var<private> nodeVar42 : f32;
var<private> nodeVar43 : f32;
var<private> nodeVar44 : vec4<f32>;
var<private> nodeVar45 : i32;
var<private> nodeVar46 : f32;
var<private> nodeVar47 : i32;
var<private> nodeVar48 : i32;
var<private> nodeVar49 : i32;
var<private> nodeVar50 : i32;
var<private> nodeVar51 : i32;
var<private> nodeVar52 : i32;
var<private> nodeVar53 : vec4<f32>;
var<private> nodeVar54 : f32;
var<private> nodeVar55 : f32;
var<private> nodeVar56 : f32;
var<private> nodeVar57 : i32;
var<private> nodeVar58 : i32;
var<private> nodeVar59 : i32;
var<private> nodeVar60 : i32;
var<private> nodeVar61 : i32;
var<private> nodeVar62 : i32;
var<private> nodeVar63 : vec4<f32>;
var<private> nodeVar64 : f32;
var<private> nodeVar65 : f32;
var<private> nodeVar66 : f32;
var<private> nodeVar67 : vec3<f32>;
var<private> nodeVar68 : vec3<f32>;
var<private> nodeVar69 : vec4<f32>;
var<private> nodeVar70 : vec4<f32>;
var<private> nodeVar71 : vec3<f32>;
var<private> nodeVar72 : vec4<f32>;
var<private> nodeVar73 : f32;
var<private> nodeVar74 : f32;
var<private> nodeVar75 : vec3<f32>;
var<private> nodeVar76 : f32;
var<private> nodeVar77 : vec3<f32>;
var<private> nodeVar78 : f32;
var<private> nodeVar79 : f32;
var<private> nodeVar80 : vec2<f32>;
var<private> nodeVar81 : vec4<f32>;
var<private> nodeVar82 : vec4<f32>;
var<private> nodeVar83 : f32;
var<private> nodeVar84 : vec4<f32>;
var<private> nodeVar85 : vec4<f32>;
var<private> nodeVar86 : f32;
var<private> nodeVar87 : vec4<f32>;
var<private> nodeVar88 : vec4<f32>;
var<private> nodeVar89 : f32;
var<private> nodeVar90 : vec4<f32>;
var<private> nodeVar91 : vec4<f32>;
var<private> nodeVar92 : vec4<f32>;

// codes
fn tsl_mod_vec2( x : vec2f, y : vec2f ) -> vec2f { return x - y * floor( x / y ); }
fn tsl_mod_float( x : f32, y : f32 ) -> f32 { return x - y * floor( x / y ); }


@compute @workgroup_size( 64, 1, 1 )
fn main( @builtin( global_invocation_id ) globalId : vec3<u32>,
	@builtin( workgroup_id ) workgroupId : vec3<u32>,
	@builtin( local_invocation_id ) localId : vec3<u32>,
	@builtin( num_workgroups ) numWorkgroups : vec3<u32> ) {

	// local vars


	// system
	instanceIndex = globalId.x
		+ globalId.y * ( 64 * numWorkgroups.x )
		+ globalId.z * ( 64 * numWorkgroups.x ) * ( 1 * numWorkgroups.y );

	// flow
	// code


	// flow -> dda-workgroup-cascade-0

	for ( var i : i32 = 0; i < 70; i ++ ) {

		let nodeConst0 = atomicAdd( &NodeBuffer_10390.value[ 0u ], 1u );
		rcAtomicJobIndex = nodeConst0;

		if ( ( rcAtomicJobIndex >= 279552u ) ) {

			break;


		}

		let rcComputeAtlasCell = vec2<i32>( i32( ( rcAtomicJobIndex % 672u ) ), i32( ( rcAtomicJobIndex / 672u ) ) );
		let rcFragCoord = ( vec2<f32>( rcComputeAtlasCell ) + vec2<f32>( 0.5 ) );
		let rcProbeGroupSize = vec2<f32>( 168.0, 104.0 );
		let rcRayXY = floor( ( rcFragCoord / rcProbeGroupSize ) );
		let rcProbeXY = tsl_mod_vec2( rcFragCoord, rcProbeGroupSize );
		let rcRayIndex = ( rcRayXY.x + ( rcRayXY.y * 4.0 ) );
		let rcActiveProbeXY = clamp( rcProbeXY, vec2<f32>( 0.5, 0.5 ), vec2<f32>( 167.5, 97.5 ) );
		let rcProbeUV = clamp( ( ( rcActiveProbeXY * vec2<f32>( 1.0 ) ) / vec2<f32>( 168.0, 98.0 ) ), vec2<f32>( 0.0 ), vec2<f32>( 1.0 ) );
		let rcProbeLocalPos = ( rcProbeUV * object.nodeUniform1 );
		let rcTheta = ( ( rcRayIndex + 0.5 ) * 0.39269908169872414 );
		let rcRayDirection = vec2<f32>( cos( rcTheta ), sin( rcTheta ) );
		let rcSegmentStartLocal = ( rcProbeLocalPos + ( rcRayDirection * vec2<f32>( object.nodeUniform2 ) ) );
		let rcSegmentStart = ( rcSegmentStartLocal + object.nodeUniform3 );

		if ( ( 0.0 > 0.5 ) ) {

			nodeVar0 = object.nodeUniform4;

		} else {

			nodeVar0 = object.nodeUniform4;

		}

		let rcTraceLimit = nodeVar0;
		nodeVar1 = vec3<f32>( 0.0, 0.0, 0.0 );
		nodeVar2 = 1.0;
		nodeVar3 = 0.0;
		nodeVar4 = 0.0;
		nodeVar6 = ( abs( rcRayDirection.x ) < 0.000001 );
		nodeVar7 = ( object.nodeUniform5 + object.nodeUniform6 );
		nodeVar8 = ( abs( rcRayDirection.y ) < 0.000001 );

		if ( ( ( nodeVar6 && ( ( rcSegmentStart.x < object.nodeUniform5.x ) || ( rcSegmentStart.x > nodeVar7.x ) ) ) || ( nodeVar8 && ( ( rcSegmentStart.y < object.nodeUniform5.y ) || ( rcSegmentStart.y > nodeVar7.y ) ) ) ) ) {

			nodeVar5 = vec2<f32>( 1.0, -1.0 );

		} else {


			if ( nodeVar6 ) {

				nodeVar9 = 0.000001;

			} else {

				nodeVar9 = rcRayDirection.x;

			}


			if ( nodeVar8 ) {

				nodeVar10 = 0.000001;

			} else {

				nodeVar10 = rcRayDirection.y;

			}

			nodeVar11 = ( vec2<f32>( 1.0 ) / vec2<f32>( nodeVar9, nodeVar10 ) );
			nodeVar12 = ( ( object.nodeUniform5 - rcSegmentStart ) * nodeVar11 );
			nodeVar13 = ( ( nodeVar7 - rcSegmentStart ) * nodeVar11 );
			nodeVar5 = vec2<f32>( max( min( nodeVar12.x, nodeVar13.x ), min( nodeVar12.y, nodeVar13.y ) ), min( max( nodeVar12.x, nodeVar13.x ), max( nodeVar12.y, nodeVar13.y ) ) );

		}

		let rcBoundsInterval = nodeVar5;
		let rcTraceEntry = max( rcBoundsInterval.x, 0.0 );
		let rcTraceExit = min( rcBoundsInterval.y, rcTraceLimit );
		let rcIntersectsWorld = ( rcTraceExit >= rcTraceEntry );
		let nodeConst1 = vec2<f32>( 2.0, 2.0 );
		let nodeConst2 = 0.00196078431372549;
		let nodeConst3 = ( rcSegmentStart + ( rcRayDirection * vec2<f32>( rcTraceEntry ) ) );
		let nodeConst4 = clamp( ( ( nodeConst3 - object.nodeUniform5 ) / object.nodeUniform6 ), vec2<f32>( 0.0 ), vec2<f32>( 1.0 ) );
		let nodeConst5 = vec2<f32>( nodeConst4.x, ( 1.0 - nodeConst4.y ) );
		let nodeConst6 = clamp( ( nodeConst5 * nodeConst1 ), vec2<f32>( 0.0, 0.0 ), ( nodeConst1 - vec2<f32>( 0.0001 ) ) );
		let nodeConst7 = vec2<f32>( ( ( rcRayDirection.x / object.nodeUniform6.x ) * nodeConst1.x ), ( ( ( rcRayDirection.y / object.nodeUniform6.y ) * nodeConst1.y ) * -1.0 ) );
		let nodeConst8 = ( abs( nodeConst7.x ) < 1e-8 );
		let nodeConst9 = ( abs( nodeConst7.y ) < 1e-8 );

		if ( nodeConst8 ) {

			nodeVar14 = 0;

		} else {


			if ( ( nodeConst7.x > 0.0 ) ) {

				nodeVar15 = 1;

			} else {

				nodeVar15 = -1;

			}

			nodeVar14 = nodeVar15;

		}


		if ( nodeConst9 ) {

			nodeVar16 = 0;

		} else {


			if ( ( nodeConst7.y > 0.0 ) ) {

				nodeVar17 = 1;

			} else {

				nodeVar17 = -1;

			}

			nodeVar16 = nodeVar17;

		}

		let nodeConst10 = vec2<i32>( nodeVar14, nodeVar16 );
		let nodeConst11 = clamp( ( nodeConst6 + ( vec2<f32>( nodeConst10 ) * vec2<f32>( 0.00001 ) ) ), vec2<f32>( 0.0, 0.0 ), ( nodeConst1 - vec2<f32>( 0.0001 ) ) );
		nodeVar18 = vec2<i32>( i32( floor( nodeConst11.x ) ), i32( floor( nodeConst11.y ) ) );

		if ( ( nodeConst10.x > 0 ) ) {

			nodeVar19 = f32( ( nodeVar18.x + 1 ) );

		} else {

			nodeVar19 = f32( nodeVar18.x );

		}


		if ( ( nodeConst10.y > 0 ) ) {

			nodeVar20 = f32( ( nodeVar18.y + 1 ) );

		} else {

			nodeVar20 = f32( nodeVar18.y );

		}

		let nodeConst12 = vec2<f32>( nodeVar19, nodeVar20 );
		let nodeConst13 = i32( floor( ( ( clamp( ( 1.0 / abs( nodeConst7.x ) ), 0.0, 262143.99975585938 ) * 4096.0 ) + 0.5 ) ) );
		let nodeConst14 = i32( floor( ( ( clamp( ( 1.0 / abs( nodeConst7.y ) ), 0.0, 262143.99975585938 ) * 4096.0 ) + 0.5 ) ) );

		if ( ( nodeConst13 < 1 ) ) {

			nodeVar21 = 1;

		} else {

			nodeVar21 = nodeConst13;

		}

		let nodeConst15 = nodeVar21;

		if ( ( nodeConst14 < 1 ) ) {

			nodeVar22 = 1;

		} else {

			nodeVar22 = nodeConst14;

		}

		let nodeConst16 = nodeVar22;

		if ( nodeConst8 ) {

			nodeVar23 = 1073741823;

		} else {

			nodeVar23 = nodeConst15;

		}


		if ( nodeConst9 ) {

			nodeVar24 = 1073741823;

		} else {

			nodeVar24 = nodeConst16;

		}

		let nodeConst17 = vec2<i32>( nodeVar23, nodeVar24 );

		if ( nodeConst8 ) {

			nodeVar25 = 1073741823;

		} else {

			nodeVar25 = i32( floor( ( ( clamp( ( ( nodeConst12.x - nodeConst6.x ) / nodeConst7.x ), 0.0, 262143.99975585938 ) * 4096.0 ) + 0.5 ) ) );

		}


		if ( nodeConst9 ) {

			nodeVar26 = 1073741823;

		} else {

			nodeVar26 = i32( floor( ( ( clamp( ( ( nodeConst12.y - nodeConst6.y ) / nodeConst7.y ), 0.0, 262143.99975585938 ) * 4096.0 ) + 0.5 ) ) );

		}

		nodeVar27 = vec2<i32>( nodeVar25, nodeVar26 );
		let nodeConst18 = i32( floor( ( ( clamp( max( ( rcTraceExit - rcTraceEntry ), 0.0 ), 0.0, 262143.99975585938 ) * 4096.0 ) + 0.5 ) ) );
		nodeVar28 = vec3<f32>( 0.0, 0.0, 0.0 );

		if ( ( ! rcIntersectsWorld ) ) {

			nodeVar29 = 1.0;

		} else {

			nodeVar29 = 0.0;

		}

		nodeVar30 = nodeVar29;

		if ( rcIntersectsWorld ) {

			nodeVar31 = 1.0;

		} else {

			nodeVar31 = 0.0;

		}

		nodeVar32 = nodeVar31;
		nodeVar33 = 0.0;

		if ( rcIntersectsWorld ) {


			for ( var i : i32 = 0; i < 4; i ++ ) {

				nodeVar35 = ( nodeVar18.x >> 1u );

				if ( ( nodeVar35 < 0 ) ) {

					nodeVar34 = 0;

				} else {


					if ( ( nodeVar35 > 0 ) ) {

						nodeVar36 = 0;

					} else {

						nodeVar36 = nodeVar35;

					}

					nodeVar34 = nodeVar36;

				}

				nodeVar38 = ( nodeVar18.y >> 1u );

				if ( ( nodeVar38 < 0 ) ) {

					nodeVar37 = 0;

				} else {


					if ( ( nodeVar38 > 0 ) ) {

						nodeVar39 = 0;

					} else {

						nodeVar39 = nodeVar38;

					}

					nodeVar37 = nodeVar39;

				}

				let nodeConst19 = vec2<i32>( nodeVar34, nodeVar37 );
				nodeVar40 = textureLoad( nodeUniform7, nodeConst19, u32( 0u ) );
				let nodeConst20 = nodeVar40.xyz;
				let nodeConst21 = u32( floor( ( ( nodeConst20.x * 255.0 ) + 0.5 ) ) );
				let nodeConst22 = u32( floor( ( ( nodeConst20.y * 255.0 ) + 0.5 ) ) );
				let nodeConst23 = u32( floor( ( ( nodeConst20.z * 255.0 ) + 0.5 ) ) );
				let nodeConst24 = u32( ( ( nodeVar18.x & 1 ) + ( ( nodeVar18.y & 1 ) * 2 ) ) );
				let nodeConst25 = ( 1u << nodeConst24 );

				if ( ( ( nodeConst21 & nodeConst25 ) > 0u ) ) {

					nodeVar41 = 1.0;

				} else {

					nodeVar41 = 0.0;

				}


				if ( ( ( nodeConst22 & nodeConst25 ) > 0u ) ) {

					nodeVar42 = 1.0;

				} else {

					nodeVar42 = 0.0;

				}


				if ( ( ( nodeConst23 & nodeConst25 ) > 0u ) ) {

					nodeVar43 = 1.0;

				} else {

					nodeVar43 = 0.0;

				}

				let nodeConst26 = vec3<f32>( nodeVar41, nodeVar42, nodeVar43 );

				if ( ( nodeConst26.z > 0.5 ) ) {

					nodeVar44 = textureLoad( nodeUniform8, nodeVar18, u32( 0u ) );
					let nodeConst27 = nodeVar44.xyz;

					if ( ( dot( nodeConst27, nodeConst27 ) > 1e-10 ) ) {

						nodeVar28 = nodeConst27;
						nodeVar30 = 2.0;
						break;


					}



				}

				let nodeConst28 = ( nodeConst26.x > 0.5 );
				let nodeConst29 = ( nodeConst26.y > 0.5 );

				if ( ( ( nodeVar32 > 0.5 ) && ( ! nodeConst28 ) ) ) {

					nodeVar32 = 0.0;


				}

				let nodeConst30 = ( nodeVar32 < 0.5 );

				if ( ( ( nodeConst30 && ( nodeVar33 > 0.5 ) ) && ( ! nodeConst29 ) ) ) {

					nodeVar30 = -1.0;
					break;


				}


				if ( ( ( nodeConst30 && nodeConst28 ) && ( ! nodeConst29 ) ) ) {

					nodeVar30 = -1.0;
					break;


				}


				if ( ( nodeConst30 && nodeConst29 ) ) {

					nodeVar33 = 1.0;


				}


				if ( ( nodeVar27.x < nodeVar27.y ) ) {

					nodeVar45 = nodeVar27.x;

				} else {

					nodeVar45 = nodeVar27.y;

				}

				let nodeConst31 = nodeVar45;

				if ( ( nodeConst31 >= nodeConst18 ) ) {


					if ( ( nodeVar33 > 0.5 ) ) {

						nodeVar46 = -1.0;

					} else {

						nodeVar46 = 1.0;

					}

					nodeVar30 = nodeVar46;
					break;


				}

				let nodeConst32 = ( abs( ( nodeVar27.x - nodeVar27.y ) ) <= 1 );
				let nodeConst33 = ( ( ! nodeConst32 ) && ( nodeVar27.x < nodeVar27.y ) );
				let nodeConst34 = ( ( ! nodeConst32 ) && ( nodeVar27.y < nodeVar27.x ) );

				if ( nodeConst32 ) {

					let nodeConst35 = vec2<i32>( ( nodeVar18.x + nodeConst10.x ), nodeVar18.y );
					let nodeConst36 = vec2<i32>( nodeVar18.x, ( nodeVar18.y + nodeConst10.y ) );
					nodeVar48 = ( nodeConst35.x >> 1u );

					if ( ( nodeVar48 < 0 ) ) {

						nodeVar47 = 0;

					} else {


						if ( ( nodeVar48 > 0 ) ) {

							nodeVar49 = 0;

						} else {

							nodeVar49 = nodeVar48;

						}

						nodeVar47 = nodeVar49;

					}

					nodeVar51 = ( nodeConst35.y >> 1u );

					if ( ( nodeVar51 < 0 ) ) {

						nodeVar50 = 0;

					} else {


						if ( ( nodeVar51 > 0 ) ) {

							nodeVar52 = 0;

						} else {

							nodeVar52 = nodeVar51;

						}

						nodeVar50 = nodeVar52;

					}

					let nodeConst37 = vec2<i32>( nodeVar47, nodeVar50 );
					nodeVar53 = textureLoad( nodeUniform7, nodeConst37, u32( 0u ) );
					let nodeConst38 = nodeVar53.xyz;
					let nodeConst39 = u32( floor( ( ( nodeConst38.x * 255.0 ) + 0.5 ) ) );
					let nodeConst40 = u32( floor( ( ( nodeConst38.y * 255.0 ) + 0.5 ) ) );
					let nodeConst41 = u32( floor( ( ( nodeConst38.z * 255.0 ) + 0.5 ) ) );
					let nodeConst42 = u32( ( ( nodeConst35.x & 1 ) + ( ( nodeConst35.y & 1 ) * 2 ) ) );
					let nodeConst43 = ( 1u << nodeConst42 );

					if ( ( ( nodeConst39 & nodeConst43 ) > 0u ) ) {

						nodeVar54 = 1.0;

					} else {

						nodeVar54 = 0.0;

					}


					if ( ( ( nodeConst40 & nodeConst43 ) > 0u ) ) {

						nodeVar55 = 1.0;

					} else {

						nodeVar55 = 0.0;

					}


					if ( ( ( nodeConst41 & nodeConst43 ) > 0u ) ) {

						nodeVar56 = 1.0;

					} else {

						nodeVar56 = 0.0;

					}

					let nodeConst44 = vec3<f32>( nodeVar54, nodeVar55, nodeVar56 );
					nodeVar58 = ( nodeConst36.x >> 1u );

					if ( ( nodeVar58 < 0 ) ) {

						nodeVar57 = 0;

					} else {


						if ( ( nodeVar58 > 0 ) ) {

							nodeVar59 = 0;

						} else {

							nodeVar59 = nodeVar58;

						}

						nodeVar57 = nodeVar59;

					}

					nodeVar61 = ( nodeConst36.y >> 1u );

					if ( ( nodeVar61 < 0 ) ) {

						nodeVar60 = 0;

					} else {


						if ( ( nodeVar61 > 0 ) ) {

							nodeVar62 = 0;

						} else {

							nodeVar62 = nodeVar61;

						}

						nodeVar60 = nodeVar62;

					}

					let nodeConst45 = vec2<i32>( nodeVar57, nodeVar60 );
					nodeVar63 = textureLoad( nodeUniform7, nodeConst45, u32( 0u ) );
					let nodeConst46 = nodeVar63.xyz;
					let nodeConst47 = u32( floor( ( ( nodeConst46.x * 255.0 ) + 0.5 ) ) );
					let nodeConst48 = u32( floor( ( ( nodeConst46.y * 255.0 ) + 0.5 ) ) );
					let nodeConst49 = u32( floor( ( ( nodeConst46.z * 255.0 ) + 0.5 ) ) );
					let nodeConst50 = u32( ( ( nodeConst36.x & 1 ) + ( ( nodeConst36.y & 1 ) * 2 ) ) );
					let nodeConst51 = ( 1u << nodeConst50 );

					if ( ( ( nodeConst47 & nodeConst51 ) > 0u ) ) {

						nodeVar64 = 1.0;

					} else {

						nodeVar64 = 0.0;

					}


					if ( ( ( nodeConst48 & nodeConst51 ) > 0u ) ) {

						nodeVar65 = 1.0;

					} else {

						nodeVar65 = 0.0;

					}


					if ( ( ( nodeConst49 & nodeConst51 ) > 0u ) ) {

						nodeVar66 = 1.0;

					} else {

						nodeVar66 = 0.0;

					}

					let nodeConst52 = vec3<f32>( nodeVar64, nodeVar65, nodeVar66 );
					nodeVar67 = vec3<f32>( 0.0, 0.0, 0.0 );
					nodeVar68 = vec3<f32>( 0.0, 0.0, 0.0 );

					if ( ( nodeConst44.z > 0.5 ) ) {

						nodeVar69 = textureLoad( nodeUniform8, nodeConst35, u32( 0u ) );
						let nodeConst53 = nodeVar69.xyz;
						nodeVar67 = nodeConst53;


					}


					if ( ( nodeConst52.z > 0.5 ) ) {

						nodeVar70 = textureLoad( nodeUniform8, nodeConst36, u32( 0u ) );
						let nodeConst54 = nodeVar70.xyz;
						nodeVar68 = nodeConst54;


					}


					if ( ( dot( nodeVar67, nodeVar67 ) > dot( nodeVar68, nodeVar68 ) ) ) {

						nodeVar71 = nodeVar67;

					} else {

						nodeVar71 = nodeVar68;

					}


					if ( ( dot( nodeVar71, nodeVar71 ) > 1e-10 ) ) {

						nodeVar28 = nodeVar71;
						nodeVar30 = 2.0;
						break;


					}

					let nodeConst55 = ( nodeConst44.y > 0.5 );
					let nodeConst56 = ( nodeConst52.y > 0.5 );
					let nodeConst57 = ( ( nodeConst44.x > 0.5 ) && ( ! nodeConst55 ) );
					let nodeConst58 = ( ( nodeConst52.x > 0.5 ) && ( ! nodeConst56 ) );
					let nodeConst59 = ( nodeVar32 < 0.5 );

					if ( ( nodeConst59 && ( nodeConst57 || nodeConst58 ) ) ) {

						nodeVar30 = -1.0;
						break;


					}


					if ( ( nodeConst59 && ( nodeConst55 || nodeConst56 ) ) ) {

						nodeVar33 = 1.0;


					}


					if ( ( ( nodeConst59 && ( nodeVar33 > 0.5 ) ) && ( ! ( nodeConst55 || nodeConst56 ) ) ) ) {

						nodeVar30 = -1.0;
						break;


					}

					nodeVar18.x = ( nodeVar18.x + nodeConst10.x );
					nodeVar18.y = ( nodeVar18.y + nodeConst10.y );
					nodeVar27.x = ( nodeVar27.x + nodeConst17.x );
					nodeVar27.y = ( nodeVar27.y + nodeConst17.y );


				}


				if ( nodeConst33 ) {

					nodeVar18.x = ( nodeVar18.x + nodeConst10.x );
					nodeVar27.x = ( nodeVar27.x + nodeConst17.x );


				}


				if ( nodeConst34 ) {

					nodeVar18.y = ( nodeVar18.y + nodeConst10.y );
					nodeVar27.y = ( nodeVar27.y + nodeConst17.y );


				}


			}



		}

		nodeVar72 = vec4<f32>( nodeVar28, nodeVar30 );
		nodeVar1 = nodeVar72.xyz;

		if ( ( ( nodeVar72.w < -0.5 ) || ( nodeVar72.w > 1.5 ) ) ) {

			nodeVar73 = 0.0;

		} else {

			nodeVar73 = 1.0;

		}

		nodeVar2 = nodeVar73;

		if ( ( ( nodeVar72.w > 0.5 ) && ( nodeVar72.w < 1.5 ) ) ) {

			nodeVar74 = 1.0;

		} else {

			nodeVar74 = 0.0;

		}

		nodeVar4 = nodeVar74;

		if ( ( ( ( nodeVar2 > 0.5 ) && ( nodeVar4 > 0.5 ) ) && ( 0.0 > 0.5 ) ) ) {

			nodeVar1 = vec3<f32>( 0.0, 0.0, 0.0 );
			nodeVar2 = 0.0;


		}

		nodeVar75 = nodeVar1;
		nodeVar76 = nodeVar2;

		if ( ( nodeVar2 > 0.0 ) ) {

			nodeVar77 = vec3<f32>( 0.0, 0.0, 0.0 );
			nodeVar78 = 0.0;
			nodeVar79 = ( ( rcRayIndex * 4.0 ) + 0.0 );
			nodeVar80 = clamp( ( rcProbeXY * vec2<f32>( 0.5 ) ), vec2<f32>( 0.5, 0.5 ), vec2<f32>( 83.5, 48.5 ) );
			nodeVar81 = textureSampleLevel( nodeUniform9, nodeUniform9_sampler, ( ( ( vec2<f32>( tsl_mod_float( nodeVar79, 8.0 ), floor( ( nodeVar79 / 8.0 ) ) ) * vec2<f32>( 84.0, 52.0 ) ) + nodeVar80 ) / vec2<f32>( 672.0, 416.0 ) ), 0.0 );
			nodeVar82 = vec4<f32>( ( nodeVar81.xyz * vec3<f32>( object.nodeUniform10 ) ), nodeVar81.w );
			nodeVar77 = ( nodeVar77 + nodeVar82.xyz );
			nodeVar78 = ( nodeVar78 + nodeVar82.w );
			nodeVar83 = ( ( rcRayIndex * 4.0 ) + 1.0 );
			nodeVar84 = textureSampleLevel( nodeUniform9, nodeUniform9_sampler, ( ( ( vec2<f32>( tsl_mod_float( nodeVar83, 8.0 ), floor( ( nodeVar83 / 8.0 ) ) ) * vec2<f32>( 84.0, 52.0 ) ) + nodeVar80 ) / vec2<f32>( 672.0, 416.0 ) ), 0.0 );
			nodeVar85 = vec4<f32>( ( nodeVar84.xyz * vec3<f32>( object.nodeUniform10 ) ), nodeVar84.w );
			nodeVar77 = ( nodeVar77 + nodeVar85.xyz );
			nodeVar78 = ( nodeVar78 + nodeVar85.w );
			nodeVar86 = ( ( rcRayIndex * 4.0 ) + 2.0 );
			nodeVar87 = textureSampleLevel( nodeUniform9, nodeUniform9_sampler, ( ( ( vec2<f32>( tsl_mod_float( nodeVar86, 8.0 ), floor( ( nodeVar86 / 8.0 ) ) ) * vec2<f32>( 84.0, 52.0 ) ) + nodeVar80 ) / vec2<f32>( 672.0, 416.0 ) ), 0.0 );
			nodeVar88 = vec4<f32>( ( nodeVar87.xyz * vec3<f32>( object.nodeUniform10 ) ), nodeVar87.w );
			nodeVar77 = ( nodeVar77 + nodeVar88.xyz );
			nodeVar78 = ( nodeVar78 + nodeVar88.w );
			nodeVar89 = ( ( rcRayIndex * 4.0 ) + 3.0 );
			nodeVar90 = textureSampleLevel( nodeUniform9, nodeUniform9_sampler, ( ( ( vec2<f32>( tsl_mod_float( nodeVar89, 8.0 ), floor( ( nodeVar89 / 8.0 ) ) ) * vec2<f32>( 84.0, 52.0 ) ) + nodeVar80 ) / vec2<f32>( 672.0, 416.0 ) ), 0.0 );
			nodeVar91 = vec4<f32>( ( nodeVar90.xyz * vec3<f32>( object.nodeUniform10 ) ), nodeVar90.w );
			nodeVar77 = ( nodeVar77 + nodeVar91.xyz );
			nodeVar78 = ( nodeVar78 + nodeVar91.w );
			nodeVar77 = ( nodeVar77 * vec3<f32>( 0.25 ) );
			nodeVar78 = ( nodeVar78 * 0.25 );
			nodeVar75 = ( nodeVar75 + ( vec3<f32>( nodeVar76 ) * nodeVar77 ) );
			nodeVar76 = ( nodeVar76 * nodeVar78 );


		}

		nodeVar92 = vec4<f32>( nodeVar75, nodeVar76 );
		textureStore( nodeUniform11, vec2<u32>( rcComputeAtlasCell ), vec4<f32>( ( floor( ( ( clamp( ( nodeVar92.xyz / vec3<f32>( object.nodeUniform10 ) ), vec3<f32>( 0.0 ), vec3<f32>( 1.0 ) ) * vec3<f32>( object.nodeUniform12 ) ) + vec3<f32>( 0.5 ) ) ) / vec3<f32>( object.nodeUniform12 ) ), ( floor( ( ( clamp( nodeVar92.w, 0.0, 1.0 ) * object.nodeUniform12 ) + 0.5 ) ) / object.nodeUniform12 ) ) );

	}




}
